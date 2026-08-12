/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

const R = 6371000; // Earth radius in meters
/**
 * Calculate the great-circle distance between two points on Earth using the Haversine formula.
 * This is to calculate the distance between the listing address & the address provided by the user. I know, it is only
 * a rough estimation as this calculates the distance as a straight line, but it's more convenient than using an external
 * service and still gives a good approximation for sorting purposes.
 * Returns distance in meters.
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number}
 */
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c * 10) / 10;
}

/**
 * Compute the straight-line distance from a listing to each configured address.
 *
 * @param {number} lat - Listing latitude.
 * @param {number} lng - Listing longitude.
 * @param {import('../../types/listing.js').Address[]} addresses
 * @returns {Array<{label: string, meters: number}>}
 */
export function distancesToAddresses(lat, lng, addresses) {
  return (addresses || [])
    .filter((a) => a.coords && a.coords.lat !== -1)
    .map((a) => ({ label: a.label, meters: distanceMeters(a.coords.lat, a.coords.lng, lat, lng) }));
}

/**
 * Great-circle distance from a point to the boundary of a GeoJSON Polygon, in metres.
 *
 * Used by the area filter to decide whether a *coarse* geocode - a postcode or city centroid rather
 * than a front door - is close enough to the drawn area that the real flat could still sit inside
 * it. Exact coordinates go through `booleanPointInPolygon` and never reach this function; it only
 * runs for points already known to be outside, to ask "how far outside?".
 *
 * The polygon is treated as planar on a local equirectangular projection. At the scale of a city -
 * which is the only scale the area filter is ever drawn at - the curvature this ignores is far
 * smaller than the buffer it is compared against, and the alternative (a haversine per edge) would
 * buy nothing the buffer does not already absorb.
 *
 * @param {number} lat - Point latitude.
 * @param {number} lng - Point longitude.
 * @param {{geometry: {coordinates: number[][][], type: string}}} feature - GeoJSON Polygon feature.
 * @returns {number} Metres from the point to the nearest edge of the polygon's outer ring. `Infinity`
 * when the geometry is not usable.
 */
export function distanceToPolygonMeters(lat, lng, feature) {
  const ring = feature?.geometry?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 2) {
    return Infinity;
  }

  // Project the polygon into a flat metre grid centred on the point. `lat` scales longitude by
  // cos(lat); the point itself becomes the origin, which is what the segment maths needs.
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const toMetres = ([lon, la]) => [(((lon - lng) * Math.PI) / 180) * R * cosLat, (((la - lat) * Math.PI) / 180) * R];

  const pts = ring.map(toMetres);
  let min = Infinity;

  for (let i = 0; i < pts.length - 1; i++) {
    const d = pointToSegmentMeters(pts[i], pts[i + 1]);
    if (d < min) {
      min = d;
    }
  }
  return min;
}

/**
 * Distance from the origin to a line segment, both in a local metre grid.
 *
 * The origin is (0, 0) by construction, so this is the standard clamp-the-projection formula.
 *
 * @param {[number, number]} a - Segment start.
 * @param {[number, number]} b - Segment end.
 * @returns {number}
 */
function pointToSegmentMeters(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;

  // Degenerate segment (a single point). Distance is just to that point.
  if (lenSq === 0) {
    return Math.hypot(a[0], a[1]);
  }

  // Project the origin onto the line, clamped to the segment.
  let t = -(a[0] * dx + a[1] * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const px = a[0] + t * dx;
  const py = a[1] + t * dy;
  return Math.hypot(px, py);
}
