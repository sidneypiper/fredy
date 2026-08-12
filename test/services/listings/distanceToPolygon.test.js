/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { distanceToPolygonMeters, distanceMeters } from '../../../lib/services/listings/distanceCalculator.js';

// A 0.02° square polygon near (lat 50, lng 7). At this latitude one degree of longitude is about
// 71.5 km and one of latitude about 111 km, so the box is roughly 1430 m × 2226 m. The exact
// numbers are not important; the tests check the helper against hand-computed distances.
const SQUARE = {
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [7.0, 50.0], // SW
        [7.02, 50.0], // SE
        [7.02, 50.02], // NE
        [7.0, 50.02], // NW
        [7.0, 50.0], // close
      ],
    ],
  },
};

describe('distanceToPolygonMeters', () => {
  it('measures the perpendicular distance to the nearest edge for a point outside it', () => {
    // Point sits 0.01° west of the western edge, at the middle latitude, so the nearest point on
    // the polygon is straight east on that edge.
    const result = distanceToPolygonMeters(50.01, 6.99, SQUARE);
    expect(result).toBeCloseTo(715, -1); // within ~5 m of the hand-computed ~715 m
  });

  it('measures a larger distance for a point farther away', () => {
    const result = distanceToPolygonMeters(50.01, 6.9, SQUARE);
    expect(result).toBeCloseTo(7150, -1);
  });

  it('returns ~0 for a point on the boundary', () => {
    const result = distanceToPolygonMeters(50.01, 7.0, SQUARE);
    expect(result).toBeLessThan(1);
  });

  it('returns the distance to the nearest edge even for a point inside (the caller checks inside first)', () => {
    // The helper is "distance to boundary", not "inside or not"; the area filter only calls it for
    // points already known to be outside. A point in the middle of the box is ~715 m from the
    // nearer east/west edges and ~1112 m from the north/south ones.
    const result = distanceToPolygonMeters(50.01, 7.01, SQUARE);
    expect(result).toBeCloseTo(715, -1);
  });

  it('agrees with the haversine helper for an axis-aligned case', () => {
    // distanceMeters is the existing great-circle helper; the polygon distance to a point directly
    // west of a vertical edge must match it, since both reduce to the same longitude delta.
    const pointLat = 50.01;
    const pointLng = 6.99;
    const edgeLng = 7.0;
    const toPolygon = distanceToPolygonMeters(pointLat, pointLng, SQUARE);
    const haversine = distanceMeters(pointLat, pointLng, pointLat, edgeLng);
    expect(toPolygon).toBeCloseTo(haversine, -1);
  });

  it('returns Infinity for a geometry without a usable ring', () => {
    expect(distanceToPolygonMeters(50, 7, { geometry: { type: 'Polygon', coordinates: [] } })).toBe(Infinity);
    expect(distanceToPolygonMeters(50, 7, { geometry: null })).toBe(Infinity);
    expect(distanceToPolygonMeters(50, 7, null)).toBe(Infinity);
  });
});
