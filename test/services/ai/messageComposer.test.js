/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import {
  MessageComposer,
  createComposerFromSettings,
  detectLanguage,
  findAgreements,
  findMoveInDate,
  formatGermanDate,
  parseAgentName,
  parseDate,
  parseJsonAnswer,
  renderBaseText,
} from '../../../lib/services/ai/messageComposer.js';

/** A fake client that answers with the given text, or null when told to fail. */
const fakeClient = (answers) => ({
  complete: async () => {
    const next = answers.shift();
    return next === null ? null : { text: next, model: 'test-model' };
  },
});

const listing = {
  title: 'Altbau 2-Zimmer in Deutz',
  address: 'Köln-Deutz',
  description: 'Agent: Max Mustermann (Immobilien GmbH)\n\nBalkon\nEinbauküche\n\nVerfügbar ab: 01.11.2026',
};

describe('date helpers', () => {
  it('parses DD.MM.YYYY, ISO and German long dates', () => {
    expect(parseDate('01.11.2026')).toBe('2026-11-01');
    expect(parseDate('2026-11-01')).toBe('2026-11-01');
    expect(parseDate('1. November 2026')).toBe('2026-11-01');
    expect(parseDate('garbage')).toBeNull();
  });

  it('formats ISO dates as DD.MM.YYYY', () => {
    expect(formatGermanDate('2026-11-01')).toBe('01.11.2026');
  });

  it('finds the available-from date in the enriched description', () => {
    expect(findMoveInDate('Verfügbar ab: 01.11.2026')).toBe('2026-11-01');
    expect(findMoveInDate('Bezug ab sofort')).toBeNull();
    expect(findMoveInDate('available from 1 November 2026')).toBe('2026-11-01');
    expect(findMoveInDate(null)).toBeNull();
  });

  it('extracts the agent name from the enriched description', () => {
    expect(parseAgentName('Agent: Max Mustermann (GmbH)')).toBe('Max Mustermann');
    expect(parseAgentName('no agent line')).toBeNull();
  });

  it('guesses the base text language', () => {
    expect(detectLanguage('Sehr geehrte Damen und Herren, ich interessiere mich für die Wohnung.')).toBe('de');
    expect(detectLanguage('Dear Sir or Madam, I am interested in the apartment.')).toBe('en');
  });
});

describe('renderBaseText', () => {
  it('fills every placeholder', () => {
    const body = renderBaseText(
      '{{GREETING}}\n{{AD_SENTENCE}} Ich möchte gerne einziehen, frühestens {{MOVE_IN_DATE}}.',
      {
        greeting: 'Sehr geehrte Frau Mustermann,',
        moveIn: '01.11.2026',
        adSentence: 'Mich hat der Balkon angesprochen.',
      },
    );
    expect(body).toContain('Sehr geehrte Frau Mustermann,');
    expect(body).toContain('Mich hat der Balkon angesprochen.');
    expect(body).toContain('01.11.2026');
    expect(body).not.toContain('{{');
  });

  it('drops the ad sentence placeholder when there is none', () => {
    const body = renderBaseText('{{GREETING}} {{AD_SENTENCE}} Text.', { greeting: 'Hi', moveIn: 'sofort' });
    expect(body).not.toContain('{{AD_SENTENCE}}');
  });

  it('finds the agreements and their price in the enriched description', () => {
    expect(findAgreements('Möbelübernahme gegen 500 € möglich')).toEqual({ price: '500' });
    expect(findAgreements('Die Einbauküche kann für 300 Euro übernommen werden')).toEqual({ price: '300' });
    expect(findAgreements('Möbelübernahme möglich')).toEqual({ price: null });
    expect(findAgreements('Ruhige Lage, Balkon, 600 € Kaltmiete')).toBeNull();
    expect(findAgreements(null)).toBeNull();
  });

  it('fills the agreements placeholder', () => {
    const body = renderBaseText('{{GREETING}} Text. {{AGREEMENTS}}', {
      greeting: 'Hi',
      moveIn: 'sofort',
      agreements: 'Die Übernahme der Möbel ist für mich kein Problem.',
    });
    expect(body).toContain('Die Übernahme der Möbel ist für mich kein Problem.');
    expect(body).not.toContain('{{AGREEMENTS}}');
  });

  it('leaves the agreements placeholder empty when there are none', () => {
    const body = renderBaseText('{{GREETING}} Text. {{AGREEMENTS}}', { greeting: 'Hi', moveIn: 'sofort' });
    expect(body).not.toContain('{{AGREEMENTS}}');
  });
});

describe('parseJsonAnswer', () => {
  it('parses a bare JSON object', () => {
    expect(parseJsonAnswer('{"body": "hi"}')).toEqual({ body: 'hi' });
  });

  it('tolerates markdown fences and surrounding prose', () => {
    expect(parseJsonAnswer('```json\n{"body": "hi"}\n```')).toEqual({ body: 'hi' });
    expect(parseJsonAnswer('Here you go: {"body": "hi"} thanks!')).toEqual({ body: 'hi' });
  });

  it('returns null for garbage', () => {
    expect(parseJsonAnswer('not json at all')).toBeNull();
  });
});

describe('MessageComposer', () => {
  it('composes from a valid JSON answer', async () => {
    const composer = new MessageComposer({
      client: fakeClient(['{"subject": "Anfrage", "body": "Sehr geehrte Frau Mustermann, ..."}']),
      model: 'm',
    });
    const result = await composer.compose(listing, '{{GREETING}} {{AD_SENTENCE}} Text.');
    expect(result).toMatchObject({
      body: 'Sehr geehrte Frau Mustermann, ...',
      subject: 'Anfrage',
      model: 'test-model',
      fallback: false,
    });
  });

  it('retries once when the answer is not valid JSON, then falls back', async () => {
    const composer = new MessageComposer({
      client: fakeClient(['not json', '{"body": "second try"}']),
      model: 'm',
    });
    const result = await composer.compose(listing, '{{GREETING}} Text.');
    expect(result.body).toBe('second try');
    expect(result.fallback).toBe(false);
  });

  it('falls back to the template fill when the client fails', async () => {
    const composer = new MessageComposer({ client: fakeClient([null]), model: 'm' });
    const result = await composer.compose(
      listing,
      '{{GREETING}} {{AD_SENTENCE}} Ich möchte einziehen, frühestens {{MOVE_IN_DATE}}.',
    );
    expect(result.fallback).toBe(true);
    expect(result.model).toBe('template');
    expect(result.body).toContain('Sehr geehrte Frau/Herr Max Mustermann,');
    expect(result.body).toContain('Balkon');
    expect(result.body).toContain('01.11.2026');
  });

  it('skips the message when the fallback would have to praise a section heading', async () => {
    const composer = new MessageComposer({ client: fakeClient([null]), model: 'm' });
    const headingOnly = {
      title: 'Wohnung',
      description: 'Agent: Max Mustermann\n\nBeschreibung\nRuhige 2-Zimmer-Wohnung in zentraler Lage mit Balkon.',
    };
    const result = await composer.compose(headingOnly, '{{GREETING}} {{AD_SENTENCE}} Text.');
    expect(result).toBeNull();
  });

  it('returns null for an empty base text', async () => {
    const composer = new MessageComposer({ client: fakeClient(['{"body": "x"}']), model: 'm' });
    expect(await composer.compose(listing, '   ')).toBeNull();
  });
});

describe('createComposerFromSettings', () => {
  it('builds a composer when the AI is configured', () => {
    const composer = createComposerFromSettings({ ai_provider: 'ollama', ai_model: 'llama3.1', ai_api_key: 'key' });
    expect(composer).toBeInstanceOf(MessageComposer);
  });

  it('returns null when the provider, model or key is missing', () => {
    expect(createComposerFromSettings({ ai_provider: 'ollama', ai_model: 'llama3.1' })).toBeNull();
    expect(createComposerFromSettings({ ai_provider: 'ollama', ai_api_key: 'key' })).toBeNull();
    expect(createComposerFromSettings({ ai_provider: 'openai', ai_model: 'x', ai_api_key: 'key' })).toBeNull();
    expect(createComposerFromSettings({})).toBeNull();
  });
});
