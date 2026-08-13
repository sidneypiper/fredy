/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Only the storage modules that touch the database are mocked; the travel time filter reads stored
// rows and soft-deletes rejections, both of which would hit SQLite.
vi.mock('../../../lib/services/storage/listingsStorage.js', () => ({
  attachTravelTimes: vi.fn((rows) => rows),
  deleteListingsById: vi.fn(),
  getKnownListingHashesForJobAndProvider: vi.fn(() => []),
  getTravelTimesForListings: vi.fn(() => new Map()),
  storeListings: vi.fn(),
  updateListingDistances: vi.fn(),
}));
vi.mock('../../../lib/services/storage/jobStorage.js', () => ({ getJob: vi.fn() }));
vi.mock('../../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({})),
  getUserSettings: vi.fn(() => ({})),
  getAddresses: vi.fn(() => []),
}));
vi.mock('../../../lib/services/sse/sse-broker.js', () => ({ sendToUser: vi.fn() }));
vi.mock('../../../lib/notification/notify.js', () => ({ send: vi.fn(), __esModule: true }));
vi.mock('../../../lib/services/extractor/extractor.js', () => ({ default: vi.fn() }));
vi.mock('../../../lib/services/queryStringMutator.js', () => ({ default: vi.fn() }));
vi.mock('../../../lib/services/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));
vi.mock('../../../lib/services/geocoding/geoCodingService.js', () => ({ geocodeAddress: vi.fn() }));
vi.mock('../../../lib/services/listings/travelTimeSweeper.js', () => ({ updateTravelTimesForListings: vi.fn() }));
vi.mock('../../../lib/utils/formatListing.js', () => ({ formatListing: vi.fn((l) => l) }));

import FredyPipelineExecutioner from '../../../lib/FredyPipelineExecutioner.js';
import { getTravelTimesForListings, deleteListingsById } from '../../../lib/services/storage/listingsStorage.js';
import { getJob } from '../../../lib/services/storage/jobStorage.js';

// Home at (50.94, 6.96), rounded to the same precision the sweep stores its origins at.
const HOME = { label: 'Home', lat: 50.94, lng: 6.96, exactMaxMinutes: 30, coarseMaxMinutes: 45 };

/** A stored travel-time row for a listing, as getTravelTimesForListings returns it. */
function row({ label = 'Home', originLat = 50.94, originLng = 6.96, mode = 'transit', minutes = 20 } = {}) {
  return {
    listing_id: 'x',
    label,
    origin_lat: originLat,
    origin_lng: originLng,
    estimate_mode: mode,
    transit_minutes: mode === 'transit' ? minutes : null,
    car_minutes: mode === 'car' ? minutes : null,
    bike_minutes: mode === 'bike' ? minutes : null,
    walk_minutes: mode === 'walk' ? minutes : null,
  };
}

function executor(condition) {
  vi.mocked(getJob).mockReturnValue({ id: 'job-1', userId: 'u1', travelTimeCondition: condition });
  return new FredyPipelineExecutioner({}, { id: 'job-1' }, 'immoscout', {}, null);
}

function listing(id, { latitude = 50.95, longitude = 6.97, precision = 'exact' } = {}) {
  return { id, latitude, longitude, geocodePrecision: precision };
}

beforeEach(() => vi.clearAllMocks());

describe('FredyPipelineExecutioner._filterByTravelTime', () => {
  it('keeps everything when no places are configured', async () => {
    for (const condition of [null, { places: [] }]) {
      const e = executor(condition);
      const listings = [listing('a')];
      expect(await e._filterByTravelTime(listings)).toEqual(listings);
      expect(getTravelTimesForListings).not.toHaveBeenCalled();
    }
  });

  it('keeps a listing within the exact threshold and drops one beyond it', () => {
    const e = executor({ places: [HOME] });
    vi.mocked(getTravelTimesForListings).mockReturnValue(
      new Map([
        ['near', [row({ minutes: 25 })]],
        ['far', [row({ minutes: 35 })]],
      ]),
    );
    const listings = [listing('near'), listing('far')];
    expect(e._filterByTravelTime(listings)).toEqual([listing('near')]);
    expect(deleteListingsById).toHaveBeenCalledWith(['far']);
  });

  it('applies the coarse threshold to a listing with a coarse geocode', () => {
    const e = executor({ places: [HOME] });
    // 40 minutes: over the 30 exact threshold, under the 45 coarse one.
    vi.mocked(getTravelTimesForListings).mockReturnValue(
      new Map([
        ['exact-listing', [row({ minutes: 40 })]],
        ['coarse-listing', [row({ minutes: 40 })]],
      ]),
    );
    const exact = listing('exact-listing', { precision: 'exact' });
    const coarse = listing('coarse-listing', { precision: 'coarse' });
    expect(e._filterByTravelTime([exact, coarse])).toEqual([coarse]);
    expect(deleteListingsById).toHaveBeenCalledWith(['exact-listing']);
  });

  it('keeps a listing that passes any one of several places', () => {
    const work = { label: 'Work', lat: 51.0, lng: 7.0, exactMaxMinutes: 60, coarseMaxMinutes: 60 };
    const e = executor({ places: [HOME, work] });
    // Only the Work row exists and passes; the Home place has no row for this listing.
    vi.mocked(getTravelTimesForListings).mockReturnValue(
      new Map([['l1', [row({ label: 'Work', originLat: 51, originLng: 7, minutes: 55 })]]]),
    );
    expect(e._filterByTravelTime([listing('l1')])).toEqual([listing('l1')]);
  });

  it('reads the place mode column instead of assuming transit', () => {
    const work = { label: 'Work', lat: 51.0, lng: 7.0, exactMaxMinutes: 30, coarseMaxMinutes: 30 };
    const e = executor({ places: [work] });
    vi.mocked(getTravelTimesForListings).mockReturnValue(
      new Map([
        ['by-car', [row({ label: 'Work', originLat: 51, originLng: 7, mode: 'car', minutes: 25 })]],
        ['by-car-far', [row({ label: 'Work', originLat: 51, originLng: 7, mode: 'car', minutes: 40 })]],
      ]),
    );
    expect(e._filterByTravelTime([listing('by-car'), listing('by-car-far')])).toEqual([listing('by-car')]);
  });

  it('rejects a listing with no coordinates at all', () => {
    const e = executor({ places: [HOME] });
    // Rows exist for a geocoded listing, so the condition is evaluable; the un-geocoded listing
    // still cannot be measured and must be rejected.
    vi.mocked(getTravelTimesForListings).mockReturnValue(new Map([['ok', [row({ minutes: 10 })]]]));
    const noCoords = { id: 'x', latitude: -1, longitude: -1, geocodePrecision: undefined };
    expect(e._filterByTravelTime([noCoords, listing('ok')])).toEqual([listing('ok')]);
    expect(deleteListingsById).toHaveBeenCalledWith(['x']);
  });

  it('fails open when the run produced no travel times at all (routing service down)', () => {
    const e = executor({ places: [HOME] });
    vi.mocked(getTravelTimesForListings).mockReturnValue(new Map());
    const listings = [listing('a'), listing('b')];
    expect(e._filterByTravelTime(listings)).toEqual(listings);
    expect(deleteListingsById).not.toHaveBeenCalled();
  });

  it('fails open when no stored row matches any selected place (places deleted)', () => {
    const e = executor({ places: [HOME] });
    // Rows exist, but only for some other address the condition does not reference.
    vi.mocked(getTravelTimesForListings).mockReturnValue(
      new Map([['a', [row({ label: 'Work', originLat: 51, originLng: 7, minutes: 10 })]]]),
    );
    const listings = [listing('a')];
    expect(e._filterByTravelTime(listings)).toEqual(listings);
    expect(deleteListingsById).not.toHaveBeenCalled();
  });

  it('throws NoNewListingsWarning when every listing is rejected', () => {
    const e = executor({ places: [HOME] });
    vi.mocked(getTravelTimesForListings).mockReturnValue(new Map([['far', [row({ minutes: 60 })]]]));
    expect(() => e._filterByTravelTime([listing('far')])).toThrowError(
      expect.objectContaining({ name: 'NoNewListingsWarning' }),
    );
  });

  it('treats a place with no threshold for the relevant precision as not passing', () => {
    const e = executor({
      places: [{ ...HOME, exactMaxMinutes: null, coarseMaxMinutes: null }],
    });
    vi.mocked(getTravelTimesForListings).mockReturnValue(new Map([['a', [row({ minutes: 5 })]]]));
    expect(() => e._filterByTravelTime([listing('a')])).toThrowError(
      expect.objectContaining({ name: 'NoNewListingsWarning' }),
    );
  });
});
