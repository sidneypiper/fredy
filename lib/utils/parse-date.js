/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/** German month names for "1. November 2026" style dates. */
export const MONTHS_DE = {
  januar: 1,
  februar: 2,
  märz: 3,
  maerz: 3,
  april: 4,
  mai: 5,
  juni: 6,
  juli: 7,
  august: 8,
  september: 9,
  oktober: 10,
  november: 11,
  dezember: 12,
};

/** English month names for "1 November 2026" style dates. */
export const MONTHS_EN = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/**
 * Parse a date in a common German or English format into an ISO string (YYYY-MM-DD).
 *
 * Accepts DD.MM.YYYY, YYYY-MM-DD and "1. November 2026" / "1 November 2026".
 *
 * Shared between the immoscout provider (which extracts a listing's available-from date from the
 * expose) and the AI message composer (which parses the same date from the description text), so
 * the provider does not have to depend on the AI service for a pure string utility.
 *
 * @param {string} text
 * @returns {string|null} ISO date, or null when nothing parseable was found.
 */
export function parseDate(text) {
  if (!text) return null;
  const t = text.trim();
  let m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /(\d{1,2})\.?\s*([A-Za-zäöüß]+)\s+(\d{4})/.exec(t);
  if (m) {
    const month = MONTHS_DE[m[2].toLowerCase()] ?? MONTHS_EN[m[2].toLowerCase()];
    if (month) return `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}
