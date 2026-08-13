/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Per-job travel time filter.
 *
 * Jobs can require that a listing be within a configured commute of one of the user's saved
 * places, with a separate threshold for listings whose geocode is only approximate (a postcode
 * centroid) and one for exact ones. The condition stores which places were picked by their
 * coordinates - the same identity the travel time sweep matches rows by, so renaming a place in
 * settings keeps the job working - plus the two thresholds per place.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(jobs)`).all();
  if (!columns.some((column) => column.name === 'travel_time_condition')) {
    db.exec(`ALTER TABLE jobs ADD COLUMN travel_time_condition JSONB`);
  }
}
