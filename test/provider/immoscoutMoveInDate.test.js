/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { extractMoveInDate } from '../../lib/provider/immoscout.js';

/**
 * Build a minimal `/expose/{id}` body with the given structured attributes and free-text areas, in
 * the shape the mobile API returns: sections of type ATTRIBUTE_LIST (labelled attributes) and
 * TEXT_AREA (the description the current tenant or agent writes).
 *
 * @param {Array<{label: string, text: string}>} [attrs]
 * @param {Array<string>} [texts]
 */
function expose(attrs = [], texts = []) {
  return {
    sections: [
      { type: 'TOP_ATTRIBUTES', attributes: [] },
      { type: 'ATTRIBUTE_LIST', attributes: attrs },
      ...texts.map((t) => ({ type: 'TEXT_AREA', title: 'Beschreibung', text: t })),
    ],
  };
}

describe('#immoscout extractMoveInDate', () => {
  it('reads the structured "Bezugsfrei ab:" attribute (normal listings)', () => {
    expect(extractMoveInDate(expose([{ label: 'Bezugsfrei ab:', text: '01.11.2026' }]))).toBe('2026-11-01');
  });

  it('reads a German long-date attribute ("15. September 2026")', () => {
    expect(extractMoveInDate(expose([{ label: 'verfügbar ab:', text: '15. September 2026' }]))).toBe('2026-09-15');
  });

  it('returns null for a "sofort" attribute (available now = no structured date)', () => {
    expect(extractMoveInDate(expose([{ label: 'Bezugsfrei ab:', text: 'sofort' }]))).toBeNull();
  });

  it('falls back to the free text when the structured attribute has no parseable date', () => {
    // "01.09./15.09." has no year and the free text has no date either -> null.
    const body = expose(
      [{ label: 'Bezugsfrei ab:', text: '01.09./15.09.' }],
      ['Mindestmietdauer: 2 Jahre\nSuperschönes, renoviertes Apartment.'],
    );
    expect(extractMoveInDate(body)).toBeNull();
  });

  it('reads the date from free text when no structured attribute is present (TN / available soon)', () => {
    const body = expose(
      [],
      ['Die Einheit ist ab dem 01.10.2026 bezugsfrei und eignet sich ideal für eine Einzelperson.'],
    );
    expect(extractMoveInDate(body)).toBe('2026-10-01');
  });

  it('reads the sublet date from a tenant-network free-text phrasing ("Nachmieter:in ab dem ...")', () => {
    const body = expose(
      [],
      ['Ich ziehe Ende September aus und suche eine:n Nachmieter:in ab dem 15.11.2026. Die Wohnung hat einen Balkon.'],
    );
    expect(extractMoveInDate(body)).toBe('2026-11-15');
  });

  it('reads a "verfügbar ab" cue in the free text', () => {
    const body = expose([], ['Schöne Wohnung. Verfügbar ab 13.11.2026. Balkon vorhanden.']);
    expect(extractMoveInDate(body)).toBe('2026-11-13');
  });

  it('returns null when no date appears anywhere', () => {
    expect(extractMoveInDate(expose([], ['Schöne Wohnung in zentraler Lage.']))).toBeNull();
  });

  it('returns null for "Bezug ab sofort" in the free text', () => {
    expect(extractMoveInDate(expose([], ['Bezug ab sofort.']))).toBeNull();
  });

  it('prefers the structured attribute over a different date in the free text', () => {
    const body = expose(
      [{ label: 'Bezugsfrei ab:', text: '01.12.2026' }],
      ['Die Wohnung ist ab dem 01.10.2026 bezugsfrei.'],
    );
    expect(extractMoveInDate(body)).toBe('2026-12-01');
  });
});
