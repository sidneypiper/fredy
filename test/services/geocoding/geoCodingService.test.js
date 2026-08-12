/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// The geocoder is a thin layer over Nominatim plus a per-address DB cache. Both are mocked so the
// fallback logic can be exercised without network or disk.
vi.mock('../../../lib/services/storage/listingsStorage.js', () => ({
  getGeocoordinatesByAddress: vi.fn(() => null),
}));
vi.mock('../../../lib/services/geocoding/client/nominatimClient.js', () => ({
  geocode: vi.fn(),
  isPaused: vi.fn(() => false),
}));
vi.mock('../../../lib/services/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { geocodeAddress } from '../../../lib/services/geocoding/geoCodingService.js';
import { geocode as nominatimGeocode } from '../../../lib/services/geocoding/client/nominatimClient.js';
import { getGeocoordinatesByAddress } from '../../../lib/services/storage/listingsStorage.js';

beforeEach(() => vi.clearAllMocks());

describe('geocodeAddress fallback and precision', () => {
  it('returns an exact result when the full street address matches on the first try', async () => {
    nominatimGeocode.mockResolvedValueOnce({ lat: 50.9375, lng: 6.9603 });

    const result = await geocodeAddress('Hansaring 123, 50670 Köln, Altstadt & Neustadt-Nord');

    expect(result).toEqual({ lat: 50.9375, lng: 6.9603, precision: 'exact' });
    expect(nominatimGeocode).toHaveBeenCalledTimes(1);
    expect(nominatimGeocode).toHaveBeenCalledWith('Hansaring 123, 50670 Köln, Altstadt & Neustadt-Nord');
  });

  it('falls back to the street-level query and reports exact when the district suffix breaks it', async () => {
    // Full address with the appended district finds nothing; dropping the district resolves it.
    nominatimGeocode
      .mockResolvedValueOnce({ lat: -1, lng: -1 }) // "Kolberger Straße 100, 51381 Leverkusen, Quettingen-Biesenbach"
      .mockResolvedValueOnce({ lat: 51.0741, lng: 7.0438 }); // "Kolberger Straße 100, 51381 Leverkusen"

    const result = await geocodeAddress('Kolberger Straße 100, 51381 Leverkusen, Quettingen-Biesenbach');

    expect(result).toEqual({ lat: 51.0741, lng: 7.0438, precision: 'exact' });
    expect(nominatimGeocode).toHaveBeenCalledTimes(2);
    expect(nominatimGeocode).toHaveBeenNthCalledWith(2, 'Kolberger Straße 100, 51381 Leverkusen');
  });

  it('falls back to the postcode centroid and reports coarse for a zip-only address', async () => {
    nominatimGeocode
      .mockResolvedValueOnce({ lat: -1, lng: -1 }) // "50667 Köln, Altstadt & Neustadt-Nord"
      .mockResolvedValueOnce({ lat: 50.94, lng: 6.96 }); // "50667 Köln"

    const result = await geocodeAddress('50667 Köln, Altstadt & Neustadt-Nord');

    expect(result).toEqual({ lat: 50.94, lng: 6.96, precision: 'coarse' });
    expect(nominatimGeocode).toHaveBeenNthCalledWith(2, '50667 Köln');
  });

  it('reports coarse when a zip-only address matches on the first try (no street number)', async () => {
    nominatimGeocode.mockResolvedValueOnce({ lat: 50.94, lng: 6.96 });

    const result = await geocodeAddress('50667 Köln');

    expect(result).toEqual({ lat: 50.94, lng: 6.96, precision: 'coarse' });
  });

  it('returns the not-found marker with null precision when every attempt fails', async () => {
    nominatimGeocode.mockResolvedValue({ lat: -1, lng: -1 });

    const result = await geocodeAddress('Nowhere 99, 99999 Nopol');

    expect(result).toEqual({ lat: -1, lng: -1, precision: null });
  });

  it('stops falling back when Nominatim itself errors, to spare the shared rate limit', async () => {
    nominatimGeocode.mockResolvedValue(null);

    const result = await geocodeAddress('Hansaring 123, 50670 Köln, Altstadt & Neustadt-Nord');

    expect(result).toEqual({ lat: -1, lng: -1, precision: null });
    // One attempt only: an outage is not worth retrying with coarser queries.
    expect(nominatimGeocode).toHaveBeenCalledTimes(1);
  });

  it('caps the number of fallback attempts', async () => {
    // Six comma segments would otherwise mean six queries; the cap keeps it to four.
    nominatimGeocode.mockResolvedValue({ lat: -1, lng: -1 });

    await geocodeAddress('a, b, c, d, e, f');

    expect(nominatimGeocode.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('returns the cached result with its precision without calling Nominatim', async () => {
    getGeocoordinatesByAddress.mockReturnValueOnce({ lat: 50.94, lng: 6.96, precision: 'coarse' });

    const result = await geocodeAddress('50667 Köln, Altstadt & Neustadt-Nord');

    expect(result).toEqual({ lat: 50.94, lng: 6.96, precision: 'coarse' });
    expect(nominatimGeocode).not.toHaveBeenCalled();
  });

  it('returns null for a blank address', async () => {
    expect(await geocodeAddress('')).toBeNull();
    expect(await geocodeAddress(null)).toBeNull();
  });
});
