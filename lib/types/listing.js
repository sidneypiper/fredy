/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * @typedef {Object} ParsedListing
 * @property {string} id Stable unique identifier (hash) of the listing.
 * @property {string} link Link to the listing detail page.
 * @property {string} image Link to the listing image.
 * @property {string} title Title or headline of the listing.
 * @property {string} [description] Description of the listing.
 * @property {string} [address] Optional address/location text.
 * @property {number} [price] Optional price of the listing.
 * @property {number} [size] Optional size of the listing.
 * @property {number} [rooms] Optional number of rooms.
 * @property {string} [moveInDate] Optional available-from (move-in) date as an ISO string
 *   (YYYY-MM-DD), extracted from the detail page by the provider when a parseable date is present.
 *   The AI composer still reads the description (it handles fuzzy dates like "Ende September"
 *   better than a strict parser); this field only hardens the template-only fallback.
 * @property {number} [latitude] Optional latitude.
 * @property {number} [longitude] Optional longitude.
 * @property {'exact'|'coarse'} [geocodePrecision] How precise the coordinates are. Set by the
 *   geocoder when it fell back to a postcode/city centroid (`coarse`) versus a street-level hit
 *   (`exact`); `undefined` for listings that were never geocoded or whose precision is unknown.
 * @property {Array<{label: string, meters: number}>} [distances] Optional straight-line distance to each configured address.
 * @property {string} [personalizedMessage] Optional AI-personalized message to the landlord or
 *   current renter, generated from the enriched data when the job has the feature enabled.
 */

/**
 * A named reference address used for distance checking.
 *
 * @typedef {Object} Address
 * @property {string} label Display name for the address (e.g. "Home", "Work").
 * @property {string} address The raw address text entered by the user.
 * @property {{lat: number, lng: number}} coords Geocoded coordinates; lat === -1 marks a failed geocode.
 * @property {('transit'|'car'|'bike'|'walk')} [mode] How travel time to this address is measured.
 *   Defaults to public transport, which is the only mode Fredy can work out for every listing
 *   without a routing request per listing.
 * @property {{time: string}} [departure] Time of day, `HH:MM`, the travel time refers to. The day is
 *   always the next working day. Defaults to 08:00.
 */

export {};
