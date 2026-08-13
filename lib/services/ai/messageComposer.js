/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import logger from '../logger.js';
import { OllamaClient } from './ollamaClient.js';

/**
 * The system prompt for the message composer.
 *
 * Written in English on purpose: the instructions are for the model, not for the recipient. The
 * OUTPUT language is the base text's language - the model is told to mirror it, so a German base
 * text yields a German message and an English one an English message.
 *
 * The placeholders the user can put into the base text are defined here, so the prompt and the
 * UI hint stay in one place: {{GREETING}}, {{AD_SENTENCE}}, {{MOVE_IN_DATE}}.
 */
const SYSTEM_PROMPT = `You write a short first-contact message to a landlord or current tenant on behalf of a housing applicant.

CONTEXT:
- The applicant's base text is in the JSON field "base_text". It may contain the placeholders {{GREETING}}, {{AD_SENTENCE}} and {{MOVE_IN_DATE}}.
- The listing data is in the JSON field "listing".

RULES:
1. LANGUAGE: Write the whole message in the SAME language as the base text. If the base text is German, the message is German; if English, English; and so on.
2. FACTS: Never change the applicant's fixed facts: name, age, job, income, family, documents, phone number, signature. Keep them exactly as written in the base text.
3. {{GREETING}}: Replace with "Dear Mr./Ms. <name>," in the base text's language when the provider's name is known from the listing (e.g. the "Agent:" line in the enriched description), otherwise with a neutral "Dear Sir or Madam," in the base text's language.
4. {{AD_SENTENCE}}: Replace with exactly ONE sentence that highlights what is special about THIS apartment - what sets it apart from others. Base it only on the listing data: the enriched description, the title, the location. Examples: the old-building charm and high ceilings, the large balcony, the quiet courtyard location, the new fitted kitchen, the garden. The sentence must show the applicant read the listing carefully and is specifically interested in THIS apartment. Do NOT invent details; when unsure, phrase cautiously ("as far as I can see from the listing"). NEVER output the placeholder itself.
5. TRANSITION: {{AD_SENTENCE}} must flow naturally into the base text so the two read as one coherent paragraph. If the base text already opens with a greeting or a generic sentence, fold {{AD_SENTENCE}} in as the opening and let the base text continue from it. Do not repeat the same idea twice.
6. {{MOVE_IN_DATE}}: Replace with the listing's available-from date ("Verfügbar ab" / "available from" / "move-in date" in the enriched description), formatted DD.MM.YYYY (e.g. 01.11.2026), never ISO. If the listing is available immediately or the date is unknown, write "as soon as possible" in the base text's language.
7. If the listing data is missing or empty: omit {{AD_SENTENCE}} entirely, invent nothing.
8. Length: at most {max_chars} characters, no line longer than ~90 characters. No Markdown, no bullet points.
9. Do NOT mention the rent price or the number of rooms.
10. Output a finished, directly sendable message.

OUTPUT - ONLY a valid JSON object, no Markdown, no prose:
{"subject": "<optional short subject, e.g. 'Apartment inquiry Deutz'>", "body": "<the complete message>"}`;

/** German month names for "1. November 2026" style dates. */
const MONTHS_DE = {
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
const MONTHS_EN = {
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

/**
 * Format an ISO date as DD.MM.YYYY, the format the prompt demands.
 *
 * @param {string} iso - YYYY-MM-DD.
 * @returns {string}
 */
export function formatGermanDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Find the listing's available-from date in the enriched description.
 *
 * The enriched description carries the expose's free text, which usually states when the
 * apartment is available ("Verfügbar ab: 01.11.2026", "Bezug ab sofort", "available from ...").
 * Returns null when the apartment is available immediately or no date can be found - the
 * fallback then writes "as soon as possible".
 *
 * @param {string|null} description
 * @returns {string|null} ISO date, or null.
 */
export function findMoveInDate(description) {
  if (!description) return null;
  if (/(ab\s+sofort|sofort|immediately|available\s+now|bezugsfrei)/i.test(description)) return null;
  const patterns = [
    /(?:verfügbar\s+ab|verfügbar\s+ab\s*:|bezug\s*(?:ab|möglich)|einzug\s*(?:ab|möglich)|available\s+from|move[- ]?in\s+date|free\s+from|bezugsfrei\s+ab)\s*:?\s*([^,\n;]+)/i,
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(description);
    if (m) {
      const date = parseDate(m[1]);
      if (date) return date;
    }
  }
  return null;
}

/**
 * Extract the provider's name from the enriched description.
 *
 * The immoscout enrichment prefixes the description with an "Agent: <name>" line. The fallback
 * greeting uses it when present.
 *
 * @param {string|null} description
 * @returns {string|null}
 */
export function parseAgentName(description) {
  const m = /Agent:\s*([^(\n]+)/.exec(description ?? '');
  return m ? m[1].trim() : null;
}

/**
 * A cheap language guess for the template-only fallback: German when the base text contains
 * German signal words, English otherwise. Only ever used when the AI is unavailable.
 *
 * @param {string} text
 * @returns {'de'|'en'}
 */
export function detectLanguage(text) {
  return /(sehr geehrte|wohnung|miete|mit freundlichen|grüße|ich (bin|würde)|wir (sind|würden))/i.test(text)
    ? 'de'
    : 'en';
}

/**
 * The first attribute line of the enriched description ("Balkon", "Einbauküche", ...), used by
 * the fallback ad sentence. Attribute lines have no colon; the "Agent:" line and phone numbers
 * do, so they are skipped.
 *
 * @param {string|null} description
 * @returns {string|null}
 */
function firstAttribute(description) {
  for (const line of (description ?? '').split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.includes(':') && !/^Agent:/i.test(trimmed)) {
      return trimmed;
    }
  }
  return null;
}

/**
 * Fill the placeholders of the base text deterministically. Used by the fallback and as the
 * base for the AI.
 *
 * @param {string} baseText
 * @param {Object} values
 * @param {string} values.greeting
 * @param {string} values.moveIn
 * @param {string|null} [values.adSentence]
 * @returns {string}
 */
export function renderBaseText(baseText, { greeting, moveIn, adSentence = null }) {
  let body = baseText.replaceAll('{{GREETING}}', greeting).replaceAll('{{MOVE_IN_DATE}}', moveIn);
  if (adSentence) {
    body = body.replaceAll('{{AD_SENTENCE}}', adSentence);
  } else {
    body = body
      .replaceAll('{{AD_SENTENCE}}', '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return body;
}

/**
 * Parse a model answer that should be a single JSON object, tolerating markdown fences and
 * surrounding prose.
 *
 * @param {string} text
 * @returns {Object|null}
 */
export function parseJsonAnswer(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < cleaned.length; i += 1) {
      if (cleaned[i] === '{') depth += 1;
      else if (cleaned[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(cleaned.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }
}

/**
 * The result of composing a personalized message.
 *
 * @typedef {Object} ComposeResult
 * @property {string} body - The finished message.
 * @property {string|null} subject - Optional short subject.
 * @property {string} model - The model that produced it, or 'template' for the fallback.
 * @property {boolean} fallback - True when the AI was unavailable and the template fill was used.
 */

/**
 * Composes the AI-personalized message for one listing.
 *
 * Ported from the immoscouter project's composer: the base text with its placeholders is sent to
 * the model together with the enriched listing data, the answer is validated as JSON, and on any
 * AI failure the placeholders are filled deterministically so the user is never left without a
 * message.
 */
export class MessageComposer {
  /**
   * @param {Object} options
   * @param {OllamaClient} options.client
   * @param {string} options.model
   * @param {number} [options.maxChars=2000]
   * @param {number} [options.temperature=0.4]
   */
  constructor({ client, model, maxChars = 2000, temperature = 0.4 }) {
    this.client = client;
    this.model = model;
    this.maxChars = maxChars;
    this.temperature = temperature;
  }

  /**
   * Compose the personalized message for one listing.
   *
   * @param {Object} listing - The enriched listing (title, address, description, ...).
   * @param {string} baseText - The job's base text with placeholders.
   * @returns {Promise<ComposeResult|null>} Null only when the base text is empty.
   */
  async compose(listing, baseText) {
    if (!baseText || !baseText.trim()) return null;
    const system = SYSTEM_PROMPT.replace('{max_chars}', String(this.maxChars));
    const user = JSON.stringify(
      {
        base_text: baseText,
        listing: {
          title: listing.title ?? null,
          address: listing.address ?? null,
          price: listing.price ?? null,
          size: listing.size ?? null,
          rooms: listing.rooms ?? null,
          description: listing.description ?? null,
          link: listing.link ?? null,
        },
      },
      null,
      1,
    );
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const completion = await this.client.complete(messages, {
        model: this.model,
        temperature: this.temperature,
      });
      if (!completion) break;
      const parsed = parseJsonAnswer(completion.text);
      if (parsed && typeof parsed.body === 'string' && parsed.body.trim().length > 0) {
        return {
          body: parsed.body.trim(),
          subject: typeof parsed.subject === 'string' ? parsed.subject : null,
          model: completion.model,
          fallback: false,
        };
      }
      if (attempt === 1) {
        messages.push({ role: 'assistant', content: completion.text });
        messages.push({
          role: 'user',
          content:
            'Schema validation failed: the answer must be a single JSON object with a "body" string field. Answer again with ONLY valid JSON.',
        });
      }
    }
    logger.warn('AI message composition failed - using template-only fallback');
    return this.fallback(listing, baseText);
  }

  /**
   * Template-only message: placeholders filled deterministically from the listing data.
   *
   * @param {Object} listing
   * @param {string} baseText
   * @returns {ComposeResult}
   */
  fallback(listing, baseText) {
    const lang = detectLanguage(baseText);
    const agentName = parseAgentName(listing.description);
    const moveInIso = findMoveInDate(listing.description);
    const moveIn = moveInIso
      ? formatGermanDate(moveInIso)
      : lang === 'de'
        ? 'so bald wie möglich'
        : 'as soon as possible';
    const attribute = firstAttribute(listing.description);
    const adSentence = attribute
      ? lang === 'de'
        ? `Mich hat an dieser Wohnung besonders ${attribute} angesprochen.`
        : `What particularly appealed to me about this apartment is ${attribute}.`
      : null;
    const body = renderBaseText(baseText, {
      greeting:
        agentName != null
          ? lang === 'de'
            ? `Sehr geehrte Frau/Herr ${agentName},`
            : `Dear Mr./Ms. ${agentName},`
          : lang === 'de'
            ? 'Sehr geehrte Damen und Herren,'
            : 'Dear Sir or Madam,',
      moveIn,
      adSentence,
    });
    return { body, subject: null, model: 'template', fallback: true };
  }
}

/**
 * Build a composer from the global AI settings, or null when the AI is not configured.
 *
 * Only Ollama Cloud is supported for now; the provider field is checked so a future provider
 * can be added without touching the pipeline.
 *
 * @param {Record<string, any>} settings - Global settings (with secrets, e.g. from getSettings()).
 * @returns {MessageComposer|null}
 */
export function createComposerFromSettings(settings) {
  const provider = settings?.ai_provider;
  const model = settings?.ai_model;
  const apiKey = settings?.ai_api_key;
  if (provider !== 'ollama' || !model || !apiKey) return null;
  return new MessageComposer({ client: new OllamaClient({ apiKey }), model });
}
