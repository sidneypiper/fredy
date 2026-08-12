/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Record how precise a listing's geocode is.
 *
 * Portals often report only a postcode and a city, and even a full street address can fail to
 * geocode when a district name is appended to it. The geocoder now falls back to a coarser query
 * in those cases - "50667 Köln" instead of "50667 Köln, Altstadt & Neustadt-Nord" - so the listing
 * still gets a coordinate and with it a transit estimate. The catch is that a postcode centroid is
 * not a front door: a travel time or an area-polygon test that treats it like one would be wrong in
 * a consistent direction.
 *
 * This column carries the distinction. `exact` is a street-level coordinate (or one a human placed);
 * `coarse` is a postcode or city centroid. NULL means a legacy row whose precision was never
 * recorded, which the consumers treat as `exact` for backwards compatibility - the area filter
 * only ever relaxed its rule for `coarse`, so an unknown row behaves exactly as it did before.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  if (!columns.some((column) => column.name === 'geocode_precision')) {
    db.exec(`ALTER TABLE listings ADD COLUMN geocode_precision TEXT`);
  }
}
