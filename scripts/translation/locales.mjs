/**
 * Locale configuration for corpus translation.
 *
 * A locale owns its script gate, length band, and the register notes appended
 * to the shared prompt. Adding a locale is configuration, not code.
 *
 * The glossary is not here. It lives in Postgres (`translationGlossary`,
 * loaded by `lib/translation/glossary.ts`) so a reviewer can approve or edit
 * one term at a time; every caller passes the loaded `term -> target` map to
 * the engine beside the locale. `data/i18n/glossary/<code>.json` is
 * an export of that table for review and diffing, never read at runtime.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import translationLocaleNames from "../../src/i18n/translationLocaleNames.json" with { type: "json" };

import { mentionsTerm, termMatcher } from "./term-match.mjs";

/** Where `build-glossary.mjs --export` writes a locale's snapshot. */
export function glossaryPath(code) {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "../../data/i18n/glossary", `${code}.json`);
}

/**
 * The matcher for "this source mentions the term", as a RegExp. It delegates
 * to the shared matcher in `term-match.mjs` (whole word, case insensitive,
 * English inflections), so the prompt builder, the validator, the QA packet,
 * and the scoped stale replay agree on what a mention is.
 */
export function glossaryTermPattern(term) {
  return termMatcher(term);
}

const SHARED_RULES = `## Rules
1. NUMBERS, UNITS, DOSAGES: never alter, convert, round, reorder, or omit. "20-30 mg" stays "20-30 mg". Unit symbols stay in Latin script: mg stays mg, ug stays ug, ml stays ml. Do not spell a unit out in the target language.
2. PROPER NOUNS: substance names (2C-B, LSD, ibogaine), receptor names (5-HT2A), organisation names, statutes, and brand names stay in Latin script.
3. FIDELITY: translate exactly what is written. Do not add safety advice, disclaimers, hedges, or any sentence absent from the source. Do not soften or remove a warning. If the source is uncertain ("possibly", "some users report"), the translation stays equally uncertain.
4. REGISTER: neutral, factual, encyclopedic. Plain and direct, like Wikipedia. Not marketing, not forum slang, not translated-from-English stiffness.
5. LENGTH: no padding and no summarising. Every clause in the source appears in the output.
6. UNTRANSLATABLE: if part of the source is genuinely untranslatable, keep that part in the original and translate the rest.
7. MARKERS: copy every [cite:...] and [citation-needed] marker exactly as written, in the same position relative to the sentence it supports. Never add, drop, merge, or renumber one.
8. WHITESPACE: keep line breaks. A source with three lines returns three lines.`;

export const LOCALES = Object.freeze({
  "zh-Hans": {
    code: "zh-Hans",
    label: translationLocaleNames["zh-Hans"],
    scriptGate: "simplified",
    lengthBand: [0.12, 1.2],
    systemPrompt: `You are a professional Simplified Chinese (zh-Hans) localizer for dose.wiki, a harm-reduction encyclopedia about psychoactive substances.

${SHARED_RULES}
9. SCRIPT: Simplified characters only (GB 2312 scope). Never emit a Traditional form. Output Mandarin written vernacular as used on mainland-China websites, not Taiwan or Hong Kong usage.
10. PUNCTUATION: full-width Chinese punctuation, and keep Western punctuation inside Latin-script tokens (2C-B, 25 mg).
11. MEDICAL TERMS: prefer the standard mainland clinical term where one exists; otherwise keep the English term in parentheses on first mention.`,
  },
  nl: {
    code: "nl",
    label: translationLocaleNames.nl,
    scriptGate: "none",
    lengthBand: [0.6, 1.8],
    systemPrompt: `You are a professional Dutch (nl) localizer for dose.wiki, a harm-reduction encyclopedia about psychoactive substances.

${SHARED_RULES}
9. REGISTER: standard Netherlands Dutch, u-neutral, no Flemish-specific vocabulary.`,
  },
  ar: {
    code: "ar",
    label: translationLocaleNames.ar,
    scriptGate: "none",
    lengthBand: [0.4, 1.8],
    systemPrompt: `You are a professional Arabic (ar) localizer for dose.wiki, a harm-reduction encyclopedia about psychoactive substances.

${SHARED_RULES}
9. REGISTER: Modern Standard Arabic, not a regional dialect. Prefer established medical terminology and preserve Latin-script identifiers and source numerals.`,
  },
  cs: {
    code: "cs",
    label: translationLocaleNames.cs,
    scriptGate: "none",
    lengthBand: [0.6, 1.8],
    systemPrompt: `You are a professional Czech (cs) localizer for dose.wiki, a harm-reduction encyclopedia about psychoactive substances.

${SHARED_RULES}
9. REGISTER: standard written Czech with correct diacritics and established Czech medical terminology.`,
  },
  de: {
    code: "de",
    label: translationLocaleNames.de,
    scriptGate: "none",
    lengthBand: [0.6, 1.8],
    systemPrompt: `You are a professional German (de) localizer for dose.wiki, a harm-reduction encyclopedia about psychoactive substances.

${SHARED_RULES}
9. REGISTER: standard written German, using established medical terminology and natural German compounds rather than literal English phrasing.`,
  },
  es: {
    code: "es",
    label: translationLocaleNames.es,
    scriptGate: "none",
    lengthBand: [0.6, 1.8],
    systemPrompt: `You are a professional Spanish (es) localizer for dose.wiki, a harm-reduction encyclopedia about psychoactive substances.

${SHARED_RULES}
9. REGISTER: neutral international Spanish, avoiding regional slang and using established medical terminology.`,
  },
  fr: {
    code: "fr",
    label: translationLocaleNames.fr,
    scriptGate: "none",
    lengthBand: [0.6, 1.8],
    systemPrompt: `You are a professional French (fr) localizer for dose.wiki, a harm-reduction encyclopedia about psychoactive substances.

${SHARED_RULES}
9. REGISTER: standard written French, avoiding regional slang and using established medical terminology.`,
  },
  hi: {
    code: "hi",
    label: translationLocaleNames.hi,
    scriptGate: "none",
    lengthBand: [0.4, 2.0],
    systemPrompt: `You are a professional Hindi (hi) localizer for dose.wiki, a harm-reduction encyclopedia about psychoactive substances.

${SHARED_RULES}
9. REGISTER: standard written Hindi in Devanagari, not Romanized Hindi. Prefer familiar clinical terminology over unnecessarily Sanskritized wording; preserve Latin-script identifiers and source numerals.`,
  },
  ja: {
    code: "ja",
    label: translationLocaleNames.ja,
    scriptGate: "none",
    lengthBand: [0.15, 1.4],
    systemPrompt: `You are a professional Japanese (ja) localizer for dose.wiki, a harm-reduction encyclopedia about psychoactive substances.

${SHARED_RULES}
9. REGISTER: standard written Japanese in a consistent encyclopedic plain style, using modern Japanese kanji and kana and established medical terminology. Do not impose Simplified Chinese character forms.`,
  },
  ko: {
    code: "ko",
    label: translationLocaleNames.ko,
    scriptGate: "none",
    lengthBand: [0.2, 1.6],
    systemPrompt: `You are a professional Korean (ko) localizer for dose.wiki, a harm-reduction encyclopedia about psychoactive substances.

${SHARED_RULES}
9. REGISTER: standard South Korean written Korean in Hangul, using consistent encyclopedic declarative endings and established medical terminology.`,
  },
  pl: {
    code: "pl",
    label: translationLocaleNames.pl,
    scriptGate: "none",
    lengthBand: [0.6, 1.8],
    systemPrompt: `You are a professional Polish (pl) localizer for dose.wiki, a harm-reduction encyclopedia about psychoactive substances.

${SHARED_RULES}
9. REGISTER: standard written Polish with correct diacritics and natural grammatical inflection, using established medical terminology.`,
  },
  pt: {
    code: "pt",
    label: translationLocaleNames.pt,
    scriptGate: "none",
    lengthBand: [0.6, 1.8],
    systemPrompt: `You are a professional Portuguese (pt) localizer for dose.wiki, a harm-reduction encyclopedia about psychoactive substances.

${SHARED_RULES}
9. REGISTER: standard written Portuguese understandable in Brazil and Portugal, avoiding regional slang and using established medical terminology. Follow approved glossary spellings consistently rather than alternating regional variants.`,
  },
  ru: {
    code: "ru",
    label: translationLocaleNames.ru,
    scriptGate: "none",
    lengthBand: [0.6, 1.8],
    systemPrompt: `You are a professional Russian (ru) localizer for dose.wiki, a harm-reduction encyclopedia about psychoactive substances.

${SHARED_RULES}
9. REGISTER: standard written Russian in Cyrillic, using established medical terminology and natural grammatical inflection rather than transliterated English prose.`,
  },
});

export function resolveLocale(code) {
  const locale = Object.hasOwn(LOCALES, code) ? LOCALES[code] : null;
  if (!locale) {
    throw new Error(`Unknown locale ${code}. Known: ${Object.keys(LOCALES).join(", ")}`);
  }
  return locale;
}

/** Glosses printed per batch at most; past the cap a line prints the rendering only. */
export const GLOSS_CAP = 40;

/**
 * Whether a glossary term of `kind` belongs in a batch whose units come from
 * `contexts` (the `contextKind` values the units carry). Dose tiers, duration
 * stages, harm levels, legal statuses, frequencies, routes, and section
 * headings are substance-article and effect-article vocabulary: injected
 * there, and never into a trip report or a replication caption that happens
 * to use the word. Replication vocabulary is likewise confined to
 * replication contexts. A batch carrying a unit of unknown context ("any",
 * the default) is not filtered, so a caller that does not stamp its units
 * gets today's mention-based injection.
 */
export function kindInContext(kind, contexts) {
  if (contexts.has("any")) return true;
  if (kind === "replication") return contexts.has("replication");
  if (kind === "frequency" || kind === "route" || kind === "section-heading" || kind.startsWith("enum:")) {
    return contexts.has("article") || contexts.has("effect");
  }
  return true;
}

/**
 * The batch instruction. Segments travel as a JSON object keyed by opaque ids
 * so the model cannot merge, split, or reorder them, and the reply parses
 * without heuristics. `glossary` is the approved `term -> target` map. Each
 * segment lists, under its own id, only the terms it mentions (by the shared
 * matcher, inflections included) whose kind (`kinds`, `term -> kind`) belongs
 * to that segment's context (`kindInContext`), so a term never reaches an
 * unrelated segment in the same batch. `glosses` is the locale-independent
 * `term -> gloss` map: an injected term that has one is printed as
 * `term -> target  (gloss)` at its first listing so the model knows which
 * sense it is rendering, for at most `GLOSS_CAP` terms, longest terms first
 * (a multi-word term outranks a one-word homograph); past the cap, and at
 * later listings, the rendering stands alone.
 */
export function buildBatchPrompt(locale, units, { retryNote, glossary = {}, glosses = {}, kinds = {} } = {}) {
  const payload = Object.fromEntries(units.map((unit) => [unit.id, unit.source]));
  const safety = units.some((unit) => unit.contextClass === "safety");

  const lines = [
    `Translate each value into ${locale.label}.`,
    "",
    "Input JSON:",
    JSON.stringify(payload, null, 1),
    "",
    `Return ONLY a JSON object with the same keys and translated values. No preamble, no notes, no markdown fences.`,
  ];

  const labelContexts = Object.fromEntries(units.filter((unit) => unit.context).map((unit) => [unit.id, unit.context]));
  if (Object.keys(labelContexts).length > 0) {
    lines.push("", "Meaning and usage for these UI labels (context only, do not translate this metadata):", JSON.stringify(labelContexts));
  }

  if (safety) {
    lines.push(
      "",
      "These segments include dosage, legality, or harm information. Numeric values, units, and the exact strength of every warning must survive unchanged.",
    );
  }

  if (units.some((unit) => unit.markup)) {
    lines.push(
      "",
      "Some segments contain inline markup in square brackets, such as [b]...[/b], [int-link to=\"/effects/x\"]...[/int-link], and [ref to=\"3\" /]. Reproduce every bracket tag exactly as written, including its attributes, and keep each one wrapped around the same words it wraps in the source. Never add a tag, drop a tag, or translate anything inside a quoted attribute value.",
    );
  }

  if (units.some((unit) => /\{\{\s*[A-Za-z0-9_]+\s*\}\}/.test(unit.source))) {
    lines.push(
      "",
      "A {{token}} in double braces is substituted with a number or a name at display time. Copy each one exactly, braces included, and place it where the Chinese sentence needs it.",
    );
  }

  if (units.some((unit) => unit.source.includes("{{DWPROTECT"))) {
    lines.push(
      "",
      "Opaque {{DWPROTECT...}} tokens represent exact source syntax or digits. Copy every token exactly once and place it where the translated sentence needs it. Never alter, translate, duplicate, or omit a token.",
    );
  }

  const entries = Object.entries(glossary);
  const perUnit = units
    .map((unit) => {
      const contexts = new Set([unit.contextKind ?? "any"]);
      const source = unit.originalSource ?? unit.source;
      return { id: unit.id, terms: entries.filter(([term]) => kindInContext(kinds[term] ?? "", contexts) && mentionsTerm(source, term)) };
    })
    .filter((unit) => unit.terms.length > 0);
  const injected = [...new Set(perUnit.flatMap((unit) => unit.terms.map(([term]) => term)))];
  const glossed = new Set(
    injected
      .filter((term) => glosses[term])
      .sort((a, b) => b.length - a.length || a.localeCompare(b))
      .slice(0, GLOSS_CAP),
  );

  if (perUnit.length > 0) {
    const glossPrinted = new Set();
    const listing = perUnit.flatMap((unit) => [
      `[${unit.id}]`,
      ...unit.terms.map(([term, expected]) => {
        if (!glossed.has(term) || glossPrinted.has(term)) return `${term} -> ${expected}`;
        glossPrinted.add(term);
        return `${term} -> ${expected}  (${glosses[term]})`;
      }),
    ]);
    lines.push("", "Use these fixed equivalents, each only in the segment it is listed under:", listing.join("\n"));
  }

  if (retryNote) {
    lines.push("", `Previous attempt was rejected: ${retryNote}`);
  }

  return lines.join("\n");
}
