/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Per-job personalized messages.
 *
 * Jobs can opt into having an AI rewrite a base text into a personalized message per listing,
 * filled with the enriched data (greeting, a sentence about what is special about the apartment,
 * move-in date). The condition stores the toggle and the base text; the generated message itself
 * is stored per listing so it survives restarts and shows in the details view.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const jobColumns = db.prepare(`PRAGMA table_info(jobs)`).all();
  if (!jobColumns.some((column) => column.name === 'personalized_message')) {
    db.exec(`ALTER TABLE jobs ADD COLUMN personalized_message JSONB`);
  }
  const listingColumns = db.prepare(`PRAGMA table_info(listings)`).all();
  if (!listingColumns.some((column) => column.name === 'personalized_message')) {
    db.exec(`ALTER TABLE listings ADD COLUMN personalized_message TEXT`);
  }
}
