/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getGeocoordinatesByAddress } from '../storage/listingsStorage.js';
import { geocode as nominatimGeocode, isPaused as isNominatimPaused } from './client/nominatimClient.js';
import logger from '../logger.js';

/**
 * @typedef {Object} GeocodeResult
 * @property {number} lat
 * @property {number} lng
 * @property {'exact'|'coarse'|null} precision - `exact` for a street-level hit, `coarse` for a
 *   postcode/city centroid, `null` when nothing was found (`lat`/`lng` are then the `-1/-1`
 *   "looked, found nothing" marker).
 */

/** Cap on how many progressively coarser queries one address may cost. */
const MAX_FALLBACK_ATTEMPTS = 4;

/**
 * Whether a matched query is precise enough to count as a front door.
 *
 * A house number is 1-4 digits; a German postcode is 5. Exact only when a short number follows a
 * street name, which a postcode-leading line ("50667 Köln") never has. This is read off the query
 * that actually matched rather than the original address, so a full street address that only
 * resolved once its district suffix was dropped still counts as exact, and a postcode-only address
 * that matched on the first try still counts as coarse.
 *
 * @param {string} matchedQuery
 * @returns {'exact'|'coarse'}
 */
function precisionOf(matchedQuery) {
  const firstSegment = String(matchedQuery).split(',')[0].trim();
  return /\p{L}+\s+\d{1,4}\b/u.test(firstSegment) ? 'exact' : 'coarse';
}

/**
 * Geocodes an address using Nominatim or cached results from the database.
 *
 * When the full address finds nothing, the query is retried with trailing comma-separated segments
 * dropped - "Kolberger Straße 100, 51381 Leverkusen, Quettingen-Biesenbach" becomes
 * "Kolberger Straße 100, 51381 Leverkusen", and "50667 Köln, Altstadt & Neustadt-Nord" becomes
 * "50667 Köln". The first hit wins. A street-level hit is `exact`; a postcode or city centroid is
 * `coarse`, which the area filter and the UI treat more leniently than a placed pin.
 *
 * @param {string} address - The address to geocode.
 * @returns {Promise<GeocodeResult|null>} The geocoordinates with precision, or null on error.
 *   `{lat: -1, lng: -1, precision: null}` when nothing was found.
 */
export async function geocodeAddress(address) {
  if (!address) {
    return null;
  }

  try {
    // 1. Check if we already have this address geocoded in our database. The cache carries the
    //    precision too, so a postcode address resolved coarse once stays coarse for every listing
    //    that shares it.
    const cachedCoordinates = getGeocoordinatesByAddress(address);
    if (cachedCoordinates) {
      logger.debug(`Found cached geocoordinates for address: ${address}`);
      return cachedCoordinates;
    }

    // 2. If not, try Nominatim with progressively coarser fallbacks.
    return await geocodeWithFallback(address);
  } catch (error) {
    logger.error('Error during geocoding:', error);
    return null;
  }
}

/**
 * Ask Nominatim for an address, falling back to coarser forms until something matches.
 *
 * @param {string} address
 * @returns {Promise<GeocodeResult>}
 */
async function geocodeWithFallback(address) {
  const segments = String(address)
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  const attempts = Math.min(segments.length, MAX_FALLBACK_ATTEMPTS);

  for (let kept = segments.length; kept >= segments.length - attempts + 1 && kept >= 1; kept--) {
    const query = segments.slice(0, kept).join(', ');
    const result = await nominatimGeocode(query);

    // null means the request itself failed (timeout, rate limit, outage). Stop rather than burning
    // more of the shared Nominatim budget on a fallback that will probably fail the same way.
    if (result == null) {
      return { lat: -1, lng: -1, precision: null };
    }

    if (result.lat !== -1 || result.lng !== -1) {
      return { lat: result.lat, lng: result.lng, precision: precisionOf(query) };
    }
    // -1/-1: nothing matched this query. Try the next coarser form.
  }

  return { lat: -1, lng: -1, precision: null };
}

/**
 * Checks if we are currently in a rate limit pause.
 * @returns {boolean}
 */
export function isGeocodingPaused() {
  return isNominatimPaused();
}
