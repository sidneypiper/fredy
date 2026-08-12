/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Only the storage modules that touch the database are mocked. The geometry helpers
// (distanceToPolygonMeters) and @turf/boolean-point-in-polygon run for real, which is the point:
// the buffer rule is a thin layer over them.
vi.mock('../../../lib/services/storage/listingsStorage.js', () => ({
  attachTravelTimes: vi.fn((rows) => rows),
  deleteListingsById: vi.fn(),
  getKnownListingHashesForJobAndProvider: vi.fn(() => []),
  storeListings: vi.fn(),
  updateListingDistances: vi.fn(),
}));
vi.mock('../../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({ coarseAreaBufferMeters: 5000 })),
  getUserSettings: vi.fn(() => ({})),
  getAddresses: vi.fn(() => []),
}));
vi.mock('../../../lib/services/storage/jobStorage.js', () => ({ getJob: vi.fn() }));
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
import { deleteListingsById } from '../../../lib/services/storage/listingsStorage.js';
import { getSettings } from '../../../lib/services/storage/settingsStorage.js';

// A 0.02° square near (lat 50, lng 7), the same box the distance helper test uses.
const SQUARE = {
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [7.0, 50.0],
            [7.02, 50.0],
            [7.02, 50.02],
            [7.0, 50.02],
            [7.0, 50.0],
          ],
        ],
      },
    },
  ],
};

function executor(spatialFilter) {
  return new FredyPipelineExecutioner({}, { id: 'job-1', spatialFilter }, 'immoscout', {}, null);
}

beforeEach(() => vi.clearAllMocks());

describe('FredyPipelineExecutioner._filterByArea coarse-geocode handling', () => {
  it('keeps every listing when no spatial filter is set', async () => {
    const e = executor(null);
    const listings = [{ id: 'a', latitude: 1, longitude: 1, geocodePrecision: 'exact' }];
    expect(await e._filterByArea(listings)).toEqual(listings);
    expect(deleteListingsById).not.toHaveBeenCalled();
  });

  it('keeps a listing with no coordinates (cannot place it)', async () => {
    const e = executor(SQUARE);
    const listings = [{ id: 'a', latitude: null, longitude: null }];
    expect(await e._filterByArea(listings)).toEqual(listings);
  });

  it('keeps an exact listing inside the polygon', async () => {
    const e = executor(SQUARE);
    const inside = { id: 'in', latitude: 50.01, longitude: 7.01, geocodePrecision: 'exact' };
    expect(await e._filterByArea([inside])).toEqual([inside]);
    expect(deleteListingsById).not.toHaveBeenCalled();
  });

  it('drops an exact listing outside the polygon', async () => {
    const e = executor(SQUARE);
    const outside = { id: 'out', latitude: 50.01, longitude: 7.05, geocodePrecision: 'exact' };
    expect(await e._filterByArea([outside])).toEqual([]);
    expect(deleteListingsById).toHaveBeenCalledWith(['out']);
  });

  it('keeps a coarse listing that falls outside but within the buffer', async () => {
    // ~715 m west of the polygon edge, well inside the 5000 m default buffer.
    const e = executor(SQUARE);
    const coarseNear = { id: 'cn', latitude: 50.01, longitude: 6.99, geocodePrecision: 'coarse' };
    expect(await e._filterByArea([coarseNear])).toEqual([coarseNear]);
    expect(deleteListingsById).not.toHaveBeenCalled();
  });

  it('drops a coarse listing that falls outside beyond the buffer', async () => {
    // ~7150 m west of the polygon edge, beyond the 5000 m default buffer.
    const e = executor(SQUARE);
    const coarseFar = { id: 'cf', latitude: 50.01, longitude: 6.9, geocodePrecision: 'coarse' };
    expect(await e._filterByArea([coarseFar])).toEqual([]);
    expect(deleteListingsById).toHaveBeenCalledWith(['cf']);
  });

  it('respects a smaller configured buffer', async () => {
    vi.mocked(getSettings).mockResolvedValueOnce({ coarseAreaBufferMeters: 1000 });
    const e = executor(SQUARE);
    // ~715 m out: kept under a 1000 m buffer.
    const within = { id: 'w', latitude: 50.01, longitude: 6.99, geocodePrecision: 'coarse' };
    // ~2144 m out (east of the polygon): dropped under a 1000 m buffer.
    const beyond = { id: 'b', latitude: 50.01, longitude: 7.05, geocodePrecision: 'coarse' };
    expect(await e._filterByArea([within, beyond])).toEqual([within]);
    expect(deleteListingsById).toHaveBeenCalledWith(['b']);
  });

  it('falls back to the default buffer when the setting is missing or invalid', async () => {
    vi.mocked(getSettings).mockResolvedValueOnce({});
    const e = executor(SQUARE);
    // ~2144 m out: kept under the 5000 m default, even though the setting is absent.
    const coarse = { id: 'c', latitude: 50.01, longitude: 7.05, geocodePrecision: 'coarse' };
    expect(await e._filterByArea([coarse])).toEqual([coarse]);
  });

  it('treats a listing with unknown precision like exact (strict filter)', async () => {
    // A legacy row whose precision was never recorded must not be silently relaxed.
    const e = executor(SQUARE);
    const unknown = { id: 'u', latitude: 50.01, longitude: 7.05, geocodePrecision: undefined };
    expect(await e._filterByArea([unknown])).toEqual([]);
    expect(deleteListingsById).toHaveBeenCalledWith(['u']);
  });
});
