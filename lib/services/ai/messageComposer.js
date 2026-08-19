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
 * The four placeholders the user can put into the base text are all listed here so the prompt and
 * the UI hint stay in one place: {{GREETING}}, {{AD_SENTENCE}}, {{MOVE_IN_DATE}}, {{AGREEMENTS}}.
 *
 * The format instruction ("ONLY a JSON object") is at the very top because smaller models tend
 * to forget a constraint buried after ten content rules. Six worked examples follow in the
 * conversation (see FEW_SHOT_EXAMPLES); they are the real teacher for a small model.
 */
const SYSTEM_PROMPT = `You write a short first-contact message to a landlord or current tenant on behalf of a housing applicant.

OUTPUT - answer with ONLY a single JSON object, no Markdown, no code fences, no prose around it:
{"subject": "<the listing title>", "body": "<the complete message>"}

INPUT:
- "base_text": the applicant's template. It contains the placeholders {{GREETING}}, {{AD_SENTENCE}}, {{MOVE_IN_DATE}} and {{AGREEMENTS}}. Fill each one as described below; keep every other sentence exactly as written.
- "listing": the expose data (title, address, description).

PLACEHOLDERS:
{{GREETING}} - The salutation that fits the base text. For a formal base text (e.g. "Sehr geehrte {{GREETING}}"), fill with "Frau <lastname>" or "Herr <lastname>" from the listing's "Agent:" line (if the Agent line already says "Herr" or "Frau", use that; otherwise choose Frau/Herr from the first name); if the agent is unknown or generic ("Unbekannt"), fill with "Damen und Herren". For an informal base text (e.g. "Hallo {{GREETING}}", a casual peer message to a current tenant / Nachvermietung), use the contact's first name when the Agent line gives a personal name, or "Frau/Herr <lastname>" when only a lastname is available. If the agent is unknown/generic ("Unbekannt" or no personal name at all), leave {{GREETING}} empty and remove the whole greeting line - the "Hallo {{GREETING}}," line and the blank line after it - so the message starts with the next sentence, with that sentence's first word capitalised since it is now the opening. Never write "Hallo Damen und Herren" or "Hallo ," for a casual peer message: a formal unknown-agent salutation clashes with the Du body, and no greeting is better than a wrong one.

{{AD_SENTENCE}} - One short, simple sentence about what makes THIS apartment genuinely distinctive, grounded only in the listing's description, title and address - a specific location/neighbourhood detail, a standout structural feature, a balcony or view, high ceilings, a loggia, and the like. Mention the 1 to 3 most distinctive details when the listing genuinely has several; if only one stands out, mention just that one, and never pad with generic claims just to reach three. Join several highlights naturally inside ONE plain clause (e.g. 'den Balkon, die hohen Decken und die Lage am Rathenauplatz') - never as separate sentences, a list, or bullet points. State facts plainly, without marketing adjectives ('durchdacht', 'modern', 'gepflegt', 'innovativ', 'hochwertig', 'großzügig', 'charm', 'einzigartig', 'außergewöhnlich'); write it the way the applicant would say it in one breath to a friend, not like the listing's marketing copy. Do not mention the size in m² or the number of rooms. You may reuse the listing's words, but never copy a whole sentence verbatim, and do not invent details. If the only features are generic building/marketing claims (Fassade, Grundriss, 'gepflegtes Mehrfamilienhaus', 'durchdachte Aufteilung', 'ruhige Lage', 'helle Räume', 'zentral gelegen'), leave the placeholder empty and drop the blank line. Never output the placeholder itself. Good (one highlight): 'Besonders ansprechend finde ich den nach Süden ausgerichteten Balkon mit Blick auf den ruhigen Innenhof.' Good (several highlights): 'Besonders ansprechend finde ich die extrem hohen Decken, die Loggia zum Hinterhaus und die Lage direkt am Rathenauplatz.' Bad: 'Die klare, moderne Fassade des gepflegten Mehrfamilienhauses und der durchdachte Grundriss dieser 2-Zimmer-Wohnung im 3. Geschoss sprechen mich besonders an.'

{{MOVE_IN_DATE}} - The listing's available-from date, formatted DD.MM.YYYY (e.g. 13.11.2026). If the listing says "ab sofort"/"sofort"/"bezugsfrei" or gives no date, write "flexibel" and drop the "ab dem" before it (e.g. "Ich kann flexibel einziehen").

{{AGREEMENTS}} - A short sentence acknowledging every condition the listing EXPLICITLY requires the tenant to meet: a kitchen or furniture TAKE-OVER or purchase ('Möbelübernahme', 'Küche muss übernommen/abgelöst werden', 'gegen Entgelt', 'Abstand'), an unrenovated handover ('unrenoviert'), and the like. For each, say it is no problem for the applicant and, if a price is stated, that they are willing to pay it. A kitchen or furniture that is merely INCLUDED in the rent ('inkludiert', 'enthalten', 'im Mietpreis enthalten', 'in der Kaltmiete inkludiert') or simply present without a separate charge is NOT a condition - never mention a takeover for it. If the listing names no such condition, replace the placeholder with an empty string and remove the blank line it leaves.

RULES:
1. LANGUAGE: Write the whole message in the SAME language as the base text.
2. Keep the applicant's fixed text exactly as written: name, age, job, income, the bürgschaft sentence, the bonität sentence, the phone number, the signature. Do not reword them.
3. Do NOT mention the rent price or the number of rooms.
4. Length: at most {max_chars} characters. No Markdown, no bullet points.
5. Output a finished, directly sendable message.

Six worked examples follow in the conversation below. Match their style exactly.`;

/**
 * The applicant's base text used in the worked examples: an anonymised template with the four
 * placeholders; the examples show how each one is filled from a real listing. The same text is
 * sent for every example so the model sees that only the placeholders change while the fixed text
 * stays verbatim.
 */
const EXAMPLE_BASE_TEXT = `Sehr geehrte {{GREETING}},

Mein name ist Max Mustermann und ich bin 24 Jahre alt. Ich bin ein ruhiger Mieter, Nichtraucher und habe keine Haustiere. Als Softwareentwickler bei einem Kölner IT-Unternehmen verfüge ich über ein stabiles Netto-Einkommen von ca. 2.000 €.

{{AD_SENTENCE}}

Um Ihnen als Vermieterin absolute finanzielle Sicherheit und Planbarkeit zu garantieren, habe ich zudem eine vollumfängliche, unterschriebene Elternbürgschaft vorbereitet. Diese bringe ich gerne zur Besichtigung mit oder schicke sie Ihnen vorab als PDF.

Meine Bonität und Einkommenssituation können Sie sofort einsehen: Meine geprüfte Bewerbermappe (inkl. aktueller Schufa, Gehaltsnachweisen und verifizierten Mietzahlungen) habe ich in dieser Anfrage bereits vollständig für Sie freigeschaltet.

{{AGREEMENTS}}

Ich kann ab dem {{MOVE_IN_DATE}} einziehen und stehe für Besichtigungen kurzfristig zur Verfügung. Sie erreichen mich telefonisch am besten unter +4915112345678 oder einfach hier im Chat.

Über eine Einladung zur Besichtigung würde ich mich sehr freuen.

Mit freundlichen Grüßen
Max Mustermann`;

/**
 * Six worked input/output pairs for the few-shot prefix. Each input is the real base text plus
 * a real listing; each output is the finished message the user approved. They cover the variations
 * a small model needs to see:
 *  - unknown vs. named agent (examples 1, 4 and 6 vs. 2, 3 and 5),
 *  - an ad sentence when the listing has a distinctive detail vs. NO ad sentence when it is
 *    generic (examples 2-6 vs. 1) - the model must leave {{AD_SENTENCE}} empty rather than invent
 *    generic praise,
 *  - no agreements vs. a kitchen/furniture take-over (examples 1, 2, 4 and 6 vs. 3 and 5) - and, crucially,
 *    a kitchen that is merely INCLUDED in the rent (example 4) is NOT an agreement, so
 *    {{AGREEMENTS}} stays empty even though a kitchen is mentioned,
 *  - a fixed date vs. a flexible move-in (examples 1, 3, 4, 5 and 6 vs. 2),
 *  - a formal (Sie) base text to a landlord/agent vs. a casual (Du) base text to a current tenant
 *    / Nachvermietung (examples 1-4 vs. 5-6): example 5 uses the first name in the greeting and Du
 *    throughout; example 6 shows the Du text with an UNKNOWN agent - the greeting line is dropped
 *    entirely (and the opening sentence capitalised) instead of becoming "Hallo Damen und Herren".
 *    {{AD_SENTENCE}}/{{AGREEMENTS}} adapt to the Du register in both.
 */
const FEW_SHOT_EXAMPLES = [
  {
    input: {
      base_text: EXAMPLE_BASE_TEXT,
      listing: {
        title: 'Wohnen mit Charakter: 2-Zimmer-Wohnung in Köln',
        address: '51105 Köln, Kalk',
        description:
          'Agent: Unbekannt\n\nBeschreibung\nDiese kompakte 2-Zimmer-Wohnung in der Rolshover Straße bietet auf einer Wohnfläche von 31 Quadratmetern eine durchdachte Raumaufteilung. Die Immobilie steht ab dem 13. November 2026 zur Verfügung und eignet sich ideal für Interessenten, die eine funktionale Wohneinheit in städtischer Umgebung suchen.',
      },
    },
    output: {
      subject: 'Wohnen mit Charakter: 2-Zimmer-Wohnung in Köln',
      body: `Sehr geehrte Damen und Herren,

Mein name ist Max Mustermann und ich bin 24 Jahre alt. Ich bin ein ruhiger Mieter, Nichtraucher und habe keine Haustiere. Als Softwareentwickler bei einem Kölner IT-Unternehmen verfüge ich über ein stabiles Netto-Einkommen von ca. 2.000 €.

Um Ihnen als Vermieterin absolute finanzielle Sicherheit und Planbarkeit zu garantieren, habe ich zudem eine vollumfängliche, unterschriebene Elternbürgschaft vorbereitet. Diese bringe ich gerne zur Besichtigung mit oder schicke sie Ihnen vorab als PDF.

Meine Bonität und Einkommenssituation können Sie sofort einsehen: Meine geprüfte Bewerbermappe (inkl. aktueller Schufa, Gehaltsnachweisen und verifizierten Mietzahlungen) habe ich in dieser Anfrage bereits vollständig für Sie freigeschaltet.

Ich kann ab dem 13.11.2026 einziehen und stehe für Besichtigungen kurzfristig zur Verfügung. Sie erreichen mich telefonisch am besten unter +4915112345678 oder einfach hier im Chat.

Über eine Einladung zur Besichtigung würde ich mich sehr freuen.

Mit freundlichen Grüßen
Max Mustermann`,
    },
  },
  {
    input: {
      base_text: EXAMPLE_BASE_TEXT,
      listing: {
        title: 'Kompakt wohnen in Köln: 1,5-Zimmer-Wohnung in der Holweider Straße',
        address: '51065 Köln, Mülheim',
        description:
          'Agent: Anna Schmidt\n\nBeschreibung\nDiese ansprechende 1,5-Zimmer-Wohnung bietet auf 44 Quadratmetern eine durchdachte Aufteilung, die sich ideal für einen unkomplizierten Alltag eignet. Ein besonderes Highlight ist der nach Süden ausgerichtete Balkon mit Ausblick auf den ruhigen Innenhof. Die Räumlichkeiten sind hell gestaltet und bieten ausreichend Platz für eine individuelle Einrichtung.',
      },
    },
    output: {
      subject: 'Kompakt wohnen in Köln: 1,5-Zimmer-Wohnung in der Holweider Straße',
      body: `Sehr geehrte Frau Schmidt,

Mein name ist Max Mustermann und ich bin 24 Jahre alt. Ich bin ein ruhiger Mieter, Nichtraucher und habe keine Haustiere. Als Softwareentwickler bei einem Kölner IT-Unternehmen verfüge ich über ein stabiles Netto-Einkommen von ca. 2.000 €.

Besonders ansprechend finde ich den nach Süden ausgerichteten Balkon mit Blick auf den ruhigen Innenhof.

Um Ihnen als Vermieterin absolute finanzielle Sicherheit und Planbarkeit zu garantieren, habe ich zudem eine vollumfängliche, unterschriebene Elternbürgschaft vorbereitet. Diese bringe ich gerne zur Besichtigung mit oder schicke ich Ihnen vorab als PDF.

Meine Bonität und Einkommenssituation können Sie sofort einsehen: Meine geprüfte Bewerbermappe (inkl. aktueller Schufa, Gehaltsnachweisen und verifizierten Mietzahlungen) habe ich in dieser Anfrage bereits vollständig für Sie freigeschaltet.

Ich kann flexibel einziehen und stehe für Besichtigungen kurzfristig zur Verfügung. Sie erreichen mich telefonisch am besten unter +4915112345678 oder einfach hier im Chat.

Über eine Einladung zur Besichtigung würde ich mich sehr freuen.

Mit freundlichen Grüßen
Max Mustermann`,
    },
  },
  {
    input: {
      base_text: EXAMPLE_BASE_TEXT,
      listing: {
        title: 'Kompakt wohnen in Köln: 1,5-Zimmer-Wohnung in Eil',
        address: '51145 Köln, Eil',
        description:
          'Agent: Julia Weber\n\nWohnungstyp: Sonstige\nWohnfläche ca.: 40 m²\nKaltmiete (zzgl. Nebenkosten): 366 €\nPreis/m²: 9,15 €/m²\nNebenkosten: 200 €\nHeizkosten in Nebenkosten enthalten: Ja\nGesamtmiete: 566 €\nKaution oder Genossenschaftsanteile: 1.098\nBaujahr: unbekannt\nWesentliche Energieträger: Keine Angabe\n\nObjektbeschreibung\n- frei ab 10.10.2026\n- Küche muss übernommen werden (Preis VB)\n- Übernahme anderer Möbel auf Anfrage\n- Kellerabteil\n\nLage\nDie Immobilie befindet sich im Kölner Stadtteil Eil, der für seine familienfreundliche und sichere Atmosphäre bekannt ist. Dank der S-Bahn-Linie S12 sowie der Buslinien 151 und 152 ist eine bequeme Anbindung an die Kölner Innenstadt gewährleistet. Die Umgebung bietet zudem eine gute Infrastruktur für den täglichen Bedarf sowie vielfältige Freizeitmöglichkeiten.',
      },
    },
    output: {
      subject: 'Kompakt wohnen in Köln: 1,5-Zimmer-Wohnung in Eil',
      body: `Sehr geehrte Frau Weber,

Mein name ist Max Mustermann und ich bin 24 Jahre alt. Ich bin ein ruhiger Mieter, Nichtraucher und habe keine Haustiere. Als Softwareentwickler bei einem Kölner IT-Unternehmen verfüge ich über ein stabiles Netto-Einkommen von ca. 2.000 €.

Besonders ansprechend finde ich die gute Anbindung des Stadtteils Eil über die S-Bahn-Linie S12.

Um Ihnen als Vermieterin absolute finanzielle Sicherheit und Planbarkeit zu garantieren, habe ich zudem eine vollumfängliche, unterschriebene Elternbürgschaft vorbereitet. Diese bringe ich gerne zur Besichtigung mit oder schicke ich Ihnen vorab als PDF.

Meine Bonität und Einkommenssituation können Sie sofort einsehen: Meine geprüfte Bewerbermappe (inkl. aktueller Schufa, Gehaltsnachweisen und verifizierten Mietzahlungen) habe ich in dieser Anfrage bereits vollständig für Sie freigeschaltet.

Die Übernahme der Küche ist für mich kein Problem. Auch eine mögliche Übernahme anderer Möbel ist für mich unproblematisch.

Ich kann ab dem 10.10.2026 einziehen und stehe für Besichtigungen kurzfristig zur Verfügung. Sie erreichen mich telefonisch am besten unter +4915112345678 oder einfach hier im Chat.

Über eine Einladung zur Besichtigung würde ich mich sehr freuen.

Mit freundlichen Grüßen
Max Mustermann`,
    },
  },
  {
    input: {
      base_text: EXAMPLE_BASE_TEXT,
      listing: {
        title: 'Galeriewohnung in zentraler Lage am Rathenauplatz',
        address: '50672 Köln, Belgisches Viertel',
        description:
          'Agent: Unbekannt\n\nIn der Kaltmiete inkludiert ist eine hochwertige Einbauküche mit Siemens-Geräten. Die Wohnung besticht durch ihre außergewöhnliche, moderne Struktur und extrem zentrale Lage, direkt am Rathenauplatz. Besonderheiten: extrem hohe Decken im Wohn- und Essbereich, Loggia zum Hinterhaus, Galerie mit separatem Platz für einen Arbeitsbereich. Lage: in 5 Gehminuten am Zülplicher Platz, in 8 Gehminuten im Barbarossaplatz, 1 Minute im Belgischen Viertel. Frei ab 01.10.2026.',
      },
    },
    output: {
      subject: 'Galeriewohnung in zentraler Lage am Rathenauplatz',
      body: `Sehr geehrte Damen und Herren,

Mein name ist Max Mustermann und ich bin 24 Jahre alt. Ich bin ein ruhiger Mieter, Nichtraucher und habe keine Haustiere. Als Softwareentwickler bei einem Kölner IT-Unternehmen verfüge ich über ein stabiles Netto-Einkommen von ca. 2.000 €.

Besonders ansprechend finde ich die extrem hohen Decken, die Loggia zum Hinterhaus und die Lage direkt am Rathenauplatz.

Um Ihnen als Vermieterin absolute finanzielle Sicherheit und Planbarkeit zu garantieren, habe ich zudem eine vollumfängliche, unterschriebene Elternbürgschaft vorbereitet. Diese bringe ich gerne zur Besichtigung mit oder schicke sie Ihnen vorab als PDF.

Meine Bonität und Einkommenssituation können Sie sofort einsehen: Meine geprüfte Bewerbermappe (inkl. aktueller Schufa, Gehaltsnachweisen und verifizierten Mietzahlungen) habe ich in dieser Anfrage bereits vollständig für Sie freigeschaltet.

Ich kann ab dem 01.10.2026 einziehen und stehe für Besichtigungen kurzfristig zur Verfügung. Sie erreichen mich telefonisch am besten unter +4915112345678 oder einfach hier im Chat.

Über eine Einladung zur Besichtigung würde ich mich sehr freuen.

Mit freundlichen Grüßen
Max Mustermann`,
    },
  },
  {
    input: {
      base_text: `Hallo {{GREETING}},

mein Name ist Max, ich bin 24 und Softwareentwickler bei einem Kölner IT-Unternehmen. Ich bin ein ruhiger, zuverlässiger Mieter, Nichtraucher und habe keine Haustiere. Deine Wohnung hat mich sofort angesprochen.

{{AD_SENTENCE}}

Damit es mit dem Vermieter problemlos klappt, bringe ich alles mit, was gebraucht wird: ein stabiles Einkommen (ca. 2.000 € netto) und auf Wunsch eine Elternbürgschaft, Schufa und Gehaltsnachweise. Sag gern Bescheid, was genau gewünscht ist.

{{AGREEMENTS}}

Einziehen kann ich ab dem {{MOVE_IN_DATE}}. Für ein kurzes Kennenlernen komme ich gerne kurzfristig vorbei. Am schnellsten erreichst du mich unter +4915112345678 oder einfach hier im Chat.

Würde mich sehr freuen, von dir zu hören!

Viele Grüße
Max`,
      listing: {
        title: 'Nachmieter:in gesucht: 1-Zimmer-Wohnung mit Balkon in Köln-Sülz',
        address: '50937 Köln, Sülz',
        description:
          'Agent: Anna Schmidt\n\nIch ziehe Ende September aus und suche eine:n Nachmieter:in. Die Wohnung hat einen kleinen Balkon zur ruhigen Straßenseite. Die Küche kann gegen 400 € übernommen werden.',
      },
    },
    output: {
      subject: 'Nachmieter:in gesucht: 1-Zimmer-Wohnung mit Balkon in Köln-Sülz',
      body: `Hallo Anna,

mein Name ist Max, ich bin 24 und Softwareentwickler bei einem Kölner IT-Unternehmen. Ich bin ein ruhiger, zuverlässiger Mieter, Nichtraucher und habe keine Haustiere. Deine Wohnung hat mich sofort angesprochen.

Besonders gefällt mir der kleine Balkon zur ruhigen Straßenseite.

Damit es mit dem Vermieter problemlos klappt, bringe ich alles mit, was gebraucht wird: ein stabiles Einkommen (ca. 2.000 € netto) und auf Wunsch eine Elternbürgschaft, Schufa und Gehaltsnachweise. Sag gern Bescheid, was genau gewünscht ist.

Die Küche zu übernehmen ist für mich kein Problem, die 400 € zahle ich gerne.

Einziehen kann ich ab dem 30.09.2026. Für ein kurzes Kennenlernen komme ich gerne kurzfristig vorbei. Am schnellsten erreichst du mich unter +4915112345678 oder einfach hier im Chat.

Würde mich sehr freuen, von dir zu hören!

Viele Grüße
Max`,
    },
  },
  {
    input: {
      base_text: `Hallo {{GREETING}},

mein Name ist Max, ich bin 24 und Softwareentwickler bei einem Kölner IT-Unternehmen. Ich bin ein ruhiger, zuverlässiger Mieter, Nichtraucher und habe keine Haustiere. Deine Wohnung hat mich sofort angesprochen.

{{AD_SENTENCE}}

Damit es mit dem Vermieter problemlos klappt, bringe ich alles mit, was gebraucht wird: ein stabiles Einkommen (ca. 2.000 € netto) und auf Wunsch eine Elternbürgschaft, Schufa und Gehaltsnachweise. Sag gern Bescheid, was genau gewünscht ist.

{{AGREEMENTS}}

Einziehen kann ich ab dem {{MOVE_IN_DATE}}. Für ein kurzes Kennenlernen komme ich gerne kurzfristig vorbei. Am schnellsten erreichst du mich unter +4915112345678 oder einfach hier im Chat.

Würde mich sehr freuen, von dir zu hören!

Viele Grüße
Max`,
      listing: {
        title: 'Nachmieter:in gesucht: 2-Zimmer-Wohnung mit Garten in Köln-Mülheim',
        address: '51065 Köln, Mülheim',
        description:
          'Agent: Unbekannt\n\nIch suche eine:n Nachmieter:in ab dem 15. November 2026. Die Wohnung hat einen kleinen Garten zur Mitnutzung.',
      },
    },
    output: {
      subject: 'Nachmieter:in gesucht: 2-Zimmer-Wohnung mit Garten in Köln-Mülheim',
      body: `Mein Name ist Max, ich bin 24 und Softwareentwickler bei einem Kölner IT-Unternehmen. Ich bin ein ruhiger, zuverlässiger Mieter, Nichtraucher und habe keine Haustiere. Deine Wohnung hat mich sofort angesprochen.

Besonders gefällt mir der kleine Garten zur Mitnutzung.

Damit es mit dem Vermieter problemlos klappt, bringe ich alles mit, was gebraucht wird: ein stabiles Einkommen (ca. 2.000 € netto) und auf Wunsch eine Elternbürgschaft, Schufa und Gehaltsnachweise. Sag gern Bescheid, was genau gewünscht ist.

Einziehen kann ich ab dem 15.11.2026. Für ein kurzes Kennenlernen komme ich gerne kurzfristig vorbei. Am schnellsten erreichst du mich unter +4915112345678 oder einfach hier im Chat.

Würde mich sehr freuen, von dir zu hören!

Viele Grüße
Max`,
    },
  },
];

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
  return /(sehr geehrte|wohnung|miete|mit freundlichen|grüße|ich (bin|würde|möchte)|wir (sind|würden|möchten)|gerne|interessiere|einziehen)/i.test(
    text,
  )
    ? 'de'
    : 'en';
}

/**
 * Section titles that appear in expose descriptions but are not attributes. The immoscout
 * enrichment joins the free-text sections as "<title>\n<text>", so without this filter the
 * fallback ad sentence would happily praise the word "Beschreibung" itself.
 */
const GENERIC_SECTION_TITLES = new Set([
  'beschreibung',
  'objektbeschreibung',
  'ausstattung',
  'lage',
  'sonstiges',
  'weitere angaben',
  'energie',
  'kontakt',
  'anbieter',
  'objekt',
  'immobilie',
  'description',
  'features',
  'location',
  'other',
  'contact',
  'property',
]);

/**
 * The first attribute line of the enriched description ("Balkon", "Einbauküche", ...), used by
 * the fallback ad sentence. Attribute lines have no colon; the "Agent:" line and phone numbers
 * do, so they are skipped. Generic section titles ("Beschreibung", "Ausstattung", ...) and long
 * prose lines are skipped too, so the fallback never praises a section heading.
 *
 * @param {string|null} description
 * @returns {string|null}
 */
function firstAttribute(description) {
  for (const line of (description ?? '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.includes(':') || /^Agent:/i.test(trimmed)) continue;
    if (GENERIC_SECTION_TITLES.has(trimmed.toLowerCase())) continue;
    // Attributes are short; a long line is prose, not an attribute.
    if (trimmed.length > 40) continue;
    return trimmed;
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
/**
 * Find the agreements the listing mentions (furniture take-over, kitchen purchase) and the price
 * stated for them, if any. Used by the template-only fallback to fill {{AGREEMENTS}}.
 *
 * @param {string|null} description
 * @returns {{price: string|null}|null} Null when the listing mentions no agreements.
 */
export function findAgreements(description) {
  if (!description) return null;
  // A kitchen or furniture that is merely INCLUDED in the rent is a perk, not a condition the
  // tenant must meet. Only an explicit take-over / purchase the listing demands counts as an
  // agreement worth acknowledging.
  const included =
    /(inkludiert|enthalten|im\s+mietpreis|in\s+der\s+kaltmiete|ohne\s+aufpreis|bereits\s+im\s+mietpreis\s+enthalten)/i.test(
      description,
    );
  const mentionsKitchenFurniture = /(küche|kitchen|einbauküche|fitted\s+kitchen|möbel|furniture|mobiliar)/i.test(
    description,
  );
  const takeoverSignal =
    /(übernommen|übernahme|abzulösen|ablösung|abstand|take[- ]?over|to\s+take\s+over|abkaufen|zu\s+kaufen|gegen\s+entgelt|zu\s+übernehmen)/i.test(
      description,
    );
  if (!mentionsKitchenFurniture || !takeoverSignal || included) return null;
  // A price near the agreement keyword, not the first price in the text (which is usually the rent).
  const priceMatch =
    /(?:möbelübernahme|furniture|einbauküche|fitted kitchen|küche|kitchen|übernahme|take[- ]?over|abzulösen|abkauf)[^.]{0,120}?(\d{2,4}(?:[.,]\d{2})?)\s*(?:€|EUR|Euro)?/i.exec(
      description,
    );
  return { price: priceMatch ? priceMatch[1] : null };
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
 * @param {string} [values.agreements='']
 * @returns {string}
 */
export function renderBaseText(baseText, { greeting, moveIn, adSentence = null, agreements = '' }) {
  let body = baseText
    .replaceAll('{{GREETING}}', greeting)
    .replaceAll('{{MOVE_IN_DATE}}', moveIn)
    .replaceAll('{{AGREEMENTS}}', agreements);
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
   * @returns {Promise<ComposeResult|null>} Null when the base text is empty or the fallback
   *   cannot build a message worth sending.
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
          description: listing.description ?? null,
        },
      },
      null,
      1,
    );
    // The system prompt explains the rules; the five worked examples that follow are the real
    // teacher for a small model - each shows the same base text with a different listing and the
    // finished message that results. The real request goes last.
    const messages = [{ role: 'system', content: system }];
    for (const example of FEW_SHOT_EXAMPLES) {
      messages.push({ role: 'user', content: JSON.stringify(example.input) });
      messages.push({ role: 'assistant', content: JSON.stringify(example.output) });
    }
    messages.push({ role: 'user', content: user });
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
   * The ad sentence is omitted when no attribute can be found - a generic listing simply gets no
   * ad sentence rather than a fabricated one, and the message is still sent because a missing hook
   * is preferable to no message at all. The AI path is the primary one anyway.
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
        ? 'flexiblen Einzugstermin'
        : 'a flexible move-in date';
    const attribute = firstAttribute(listing.description);
    const adSentence = attribute
      ? lang === 'de'
        ? `Mich hat an dieser Wohnung besonders ${attribute} angesprochen.`
        : `What particularly appealed to me about this apartment is ${attribute}.`
      : null;
    const agreements = findAgreements(listing.description);
    const agreementsText = agreements
      ? lang === 'de'
        ? agreements.price
          ? `Die Übernahme der Möbel ist für mich kein Problem, und ich bin bereit, die genannten ${agreements.price} € zu zahlen.`
          : 'Die Übernahme der Möbel ist für mich kein Problem.'
        : agreements.price
          ? `Taking over the furniture is no problem for me, and I am willing to pay the stated ${agreements.price} €.`
          : 'Taking over the furniture is no problem for me.'
      : '';
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
      agreements: agreementsText,
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
