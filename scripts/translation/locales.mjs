/**
 * Locale configuration for corpus translation.
 *
 * A locale owns its script gate, length band, glossary, and the register notes
 * appended to the shared prompt. Adding a locale is configuration, not code.
 *
 * The glossary has two halves. The seed below is the harm-reduction register,
 * small enough to read and stable enough to hand-hold. The frozen file beside
 * it carries every effect name, effect category, drug class, and frequency
 * label, each rendered once by `build-glossary.mjs` and then held to. The file
 * wins where the two disagree, because the file is the one a reviewer edits.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export function glossaryPath(code) {
  return path.join(moduleDir, "glossary", `${code}.json`);
}

/** The frozen terms for one locale, or an empty map before the freeze runs. */
export function loadFrozenGlossary(code) {
  const file = glossaryPath(code);
  if (!existsSync(file)) return {};
  const document = JSON.parse(readFileSync(file, "utf8"));
  return Object.fromEntries(
    Object.entries(document.terms ?? {}).map(([term, record]) => [
      term,
      typeof record === "string" ? record : record.target,
    ]),
  );
}

export const ZH_HANS_GLOSSARY = Object.freeze({
  "come-up": "上头",
  comedown: "退效",
  dissociative: "解离剂",
  deliriant: "谵妄剂",
  dosage: "剂量",
  "harm reduction": "减害",
  hallucinogen: "致幻剂",
  psychedelic: "迷幻剂",
  "set and setting": "心态与环境",
  stimulant: "兴奋剂",
  tolerance: "耐受性",
  "trip report": "体验报告",
  withdrawal: "戒断反应",
});

export const NL_GLOSSARY = Object.freeze({
  "come-up": "opkomst",
  comedown: "afbouw",
  dosage: "dosering",
  "harm reduction": "harm reduction",
  psychedelic: "psychedelicum",
  tolerance: "tolerantie",
  withdrawal: "ontwenning",
});

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
    label: "Simplified Chinese (mainland)",
    scriptGate: "simplified",
    lengthBand: [0.12, 1.2],
    glossary: ZH_HANS_GLOSSARY,
    systemPrompt: `You are a professional Simplified Chinese (zh-Hans) localizer for dose.wiki, a harm-reduction encyclopedia about psychoactive substances.

${SHARED_RULES}
9. SCRIPT: Simplified characters only (GB 2312 scope). Never emit a Traditional form. Output Mandarin written vernacular as used on mainland-China websites, not Taiwan or Hong Kong usage.
10. PUNCTUATION: full-width Chinese punctuation, and keep Western punctuation inside Latin-script tokens (2C-B, 25 mg).
11. MEDICAL TERMS: prefer the standard mainland clinical term where one exists; otherwise keep the English term in parentheses on first mention.`,
  },
  nl: {
    code: "nl",
    label: "Dutch",
    scriptGate: "none",
    lengthBand: [0.6, 1.8],
    glossary: NL_GLOSSARY,
    systemPrompt: `You are a professional Dutch (nl) localizer for dose.wiki, a harm-reduction encyclopedia about psychoactive substances.

${SHARED_RULES}
9. REGISTER: standard Netherlands Dutch, u-neutral, no Flemish-specific vocabulary.`,
  },
});

export function resolveLocale(code) {
  const locale = LOCALES[code];
  if (!locale) {
    throw new Error(`Unknown locale ${code}. Known: ${Object.keys(LOCALES).join(", ")}`);
  }
  return { ...locale, glossary: Object.freeze({ ...locale.glossary, ...loadFrozenGlossary(code) }) };
}

/**
 * The batch instruction. Segments travel as a JSON object keyed by opaque ids
 * so the model cannot merge, split, or reorder them, and the reply parses
 * without heuristics.
 */
export function buildBatchPrompt(locale, units, { retryNote } = {}) {
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

  const glossaryTerms = Object.entries(locale.glossary ?? {})
    .filter(([term]) => units.some((unit) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(unit.source)))
    .map(([term, expected]) => `${term} -> ${expected}`);

  if (glossaryTerms.length > 0) {
    lines.push("", "Use these fixed equivalents:", glossaryTerms.join("\n"));
  }

  if (retryNote) {
    lines.push("", `Previous attempt was rejected: ${retryNote}`);
  }

  return lines.join("\n");
}
