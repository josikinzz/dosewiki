/**
 * Translation validators. Pure functions, no network, no clock.
 *
 * Every gate returns a defect code rather than a boolean, because the runner
 * routes on the code: a NUMBER_MISMATCH retries with a stricter reminder, a
 * SCRIPT_LEAK retries under the script rule, and an EMPTY_OUTPUT retries plain.
 */

import traditionalCharset from "./traditional-charset.json" with { type: "json" };

import { glossaryTermPattern } from "./locales.mjs";
import { markupTokens } from "./markup.mjs";

export const DEFECT_CODES = Object.freeze({
  EMPTY_OUTPUT: "EMPTY_OUTPUT",
  UNPARSABLE_OUTPUT: "UNPARSABLE_OUTPUT",
  NUMBER_MISMATCH: "NUMBER_MISMATCH",
  SCRIPT_LEAK: "SCRIPT_LEAK",
  UNTRANSLATED: "UNTRANSLATED",
  LENGTH_BAND: "LENGTH_BAND",
  GLOSSARY_MISS: "GLOSSARY_MISS",
  CITATION_LOSS: "CITATION_LOSS",
  NUMBER_ADDED: "NUMBER_ADDED",
  MARKUP_LOSS: "MARKUP_LOSS",
  PLACEHOLDER_LOSS: "PLACEHOLDER_LOSS",
});

/**
 * Inline markers travel through translation untouched. Both shapes appear in
 * the corpus: resolved citations and the unresolved placeholder.
 */
const CITE_MARKER = /\[cite:[^\]]+\]|\[citation-needed\]/g;

export function extractCiteMarkers(text) {
  return (text.match(CITE_MARKER) ?? []).sort();
}

/** `{{substanceCount}}` and friends are substituted at render, not translated. */
const PLACEHOLDER = /\{\{\s*[A-Za-z0-9_]+\s*\}\}/g;

export function placeholderTokens(text) {
  return (text.match(PLACEHOLDER) ?? []).map((token) => token.replace(/\s+/g, "")).sort();
}

/** Markdown link and image targets: prose on the left, a route on the right. */
const LINK_TARGET = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export function linkTargets(text) {
  return [...text.matchAll(LINK_TARGET)].map((match) => match[1]).sort();
}

/**
 * Units that bind tightly to a number: "330-650mg" is a dose, not a name, and
 * "11.7-fold" is a multiplier that survives translation as a number.
 */
const UNIT_SUFFIX =
  /(\d)\s*-?\s*(fold|mg|µg|ug|mcg|ng|kg|g|ml|l|mol|nm|um|%|hours?|hrs?|h|minutes?|mins?|min|seconds?|secs?|days?|weeks?|months?|years?)\b/gi;

/** Ring-position locants: "1,4-benzodiazepines", "pyrazolo[4,3-a]". */
const LOCANT_SET = /\d+(?:,\d+)+\s*-/g;

/**
 * Digits that belong to a name rather than a measurement: 5-HT2A, 2C-B,
 * pyrazolo[4,3-a], and the Chinese rendering of serotonin (5-羟色胺). Comparing
 * these across languages is meaningless, because a faithful translation both
 * keeps the Latin token and introduces new digit-bearing terms of its own.
 *
 * Units detach from their number first, so a dose never disappears into an
 * identifier, and the digit-initial pattern runs before the letter-initial one,
 * so "5-HT2A" leaves as a whole rather than shedding its leading 5.
 */
function stripNonMeasurementDigits(text) {
  return text
    .replace(CITE_MARKER, " ")
    .replace(UNIT_SUFFIX, "$1 $2 ")
    .replace(LOCANT_SET, " ")
    .replace(/(?<![:\d])\d+[.,]?\d*\s*-\s*(?=\p{Script=Han})/gu, " ")
    .replace(/\d[A-Za-z0-9.\u0370-\u03ff,[\]-]*[A-Za-z\u0370-\u03ff][A-Za-z0-9.\u0370-\u03ff,[\]-]*/g, " ")
    .replace(/[A-Za-z\u0370-\u03ff][A-Za-z0-9.\u0370-\u03ff,[\]-]*\d[A-Za-z0-9.\u0370-\u03ff,[\]-]*/g, " ");
}

const SCALE_WORDS = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };

function normalizeDigits(text) {
  return stripNonMeasurementDigits(text).replace(/[\uff10-\uff19]/g, (digit) =>
    String.fromCharCode(digit.charCodeAt(0) - 0xfee0),
  );
}

/** Range connectors that let "2 to 3 billion" share one scale word. */
const RANGE_GAP = /^[\s$€£¥]*(?:to|and|or|through|[-–—~])?[\s$€£¥]*$/i;

/**
 * Numbers with the English scale word that governs them, because Chinese counts
 * in myriads: "$2 to $3 billion" is written "20亿至30亿", and "2.5 million"
 * becomes "250万". The digits change while the quantity does not. In a range
 * the scale word appears once, at the end, and governs both endpoints.
 */
export function extractNumberTokens(text) {
  const normalized = normalizeDigits(text);
  const pattern = /(\d+(?:[.,]\d+)*)(\s*(?:thousand|million|billion|trillion))?/gi;
  const tokens = [];
  for (const match of normalized.matchAll(pattern)) {
    const value = match[1].replace(/,(?=\d{3}\b)/g, "");
    const word = match[2]?.trim().toLowerCase();
    tokens.push({
      value,
      scale: word ? SCALE_WORDS[word] : 1,
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  for (let index = tokens.length - 2; index >= 0; index -= 1) {
    const current = tokens[index];
    const next = tokens[index + 1];
    if (current.scale !== 1 || next.scale === 1) continue;
    if (RANGE_GAP.test(normalized.slice(current.end, next.start))) current.scale = next.scale;
  }

  return tokens;
}

/**
 * Numbers that carry dose, duration, or law. Full-width digits normalise to
 * ASCII, thousands separators collapse, and name-borne digits are gone.
 */
export function extractNumbers(text) {
  return extractNumberTokens(text).map((token) => token.value);
}

/** Digit strings a faithful Chinese rendering may use for a scaled quantity. */
export function myriadForms(value, scale) {
  if (scale === 1) return [];
  const quantity = Number(value.replace(/,/g, "")) * scale;
  if (!Number.isFinite(quantity)) return [];

  const forms = new Set();
  for (const unit of [1e4, 1e8, 1e12, 1]) {
    const scaled = quantity / unit;
    if (scaled < 1) continue;
    const rendered = Number.isInteger(scaled) ? String(scaled) : String(Number(scaled.toFixed(4)));
    if (/^\d+(\.\d+)?$/.test(rendered)) forms.add(rendered);
  }
  return [...forms];
}

const CHINESE_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/**
 * "Category 1" becomes "第一类" in any competent translation, so a small
 * integer that reappears as a Chinese numeral has survived, not vanished.
 * Anything above 99 stays Arabic in this register and gets no such allowance.
 */
export function chineseNumeralForms(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || (number > 99 && number !== 100)) return [];
  // 两 is the counter form: "the other 2 metabolites" is "另外两种".
  if (number === 2) return ["二", "两"];
  // "100%" is idiomatically 百分之百 and "100" reads as 一百.
  if (number === 100) return ["一百", "百分之百"];
  if (number < 10) return [CHINESE_DIGITS[number]];
  const tens = Math.floor(number / 10);
  const ones = number % 10;
  const head = tens === 1 ? "十" : `${CHINESE_DIGITS[tens]}十`;
  return [ones === 0 ? head : `${head}${CHINESE_DIGITS[ones]}`];
}

/**
 * Every source quantity must survive. A quantity counts as surviving when its
 * digits reappear, when a small integer reappears as a Chinese numeral, or when
 * a scaled quantity reappears in myriad form. Extra numbers in the target are
 * reported separately: translation legitimately introduces some, while a
 * fabricated dose must still be visible to a reviewer.
 */
export function compareNumbers(source, target) {
  const sourceTokens = extractNumberTokens(source);
  const targetCounts = new Map();
  for (const value of extractNumbers(target)) {
    targetCounts.set(value, (targetCounts.get(value) ?? 0) + 1);
  }

  const consume = (value) => {
    const remaining = targetCounts.get(value) ?? 0;
    if (remaining === 0) return false;
    targetCounts.set(value, remaining - 1);
    return true;
  };

  const dropped = [];
  for (const { value, scale } of sourceTokens) {
    if (consume(value)) continue;
    if (myriadForms(value, scale).some((form) => consume(form))) continue;
    if (chineseNumeralForms(value).some((form) => target.includes(form))) continue;
    // "06.05.2000" is written 2000年5月6日: a zero-padded day or month keeps
    // its value without the padding, and a dotted date survives as its parts.
    const unpadded = value.replace(/^0+(?=\d)/, "");
    if (unpadded !== value && consume(unpadded)) continue;
    const dateParts = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
    if (dateParts && dateParts.slice(1).every((part) => consume(part) || consume(part.replace(/^0+(?=\d)/, "")))) continue;
    // A plain "10,000" is idiomatically 一万 or 1万 even with no scale word.
    if (scale === 1 && /^\d+0000$/.test(unpadded)) {
      const wan = String(Number(unpadded) / 1e4);
      if (consume(wan) || chineseNumeralForms(wan).some((form) => target.includes(`${form}万`))) continue;
    }
    dropped.push(value);
  }

  const added = [...targetCounts.entries()].flatMap(([value, count]) => Array(count).fill(value));
  return { dropped, added, sourceNumbers: sourceTokens.map((token) => token.value) };
}

/**
 * Traditional-only characters, generated from OpenCC's TSCharacters table by
 * scripts/translation/build-traditional-charset.mjs. A model drifting to
 * Traditional is the classic zh-Hans failure and is invisible to a reviewer who
 * does not read Chinese.
 */
const TRADITIONAL_CHARSET = new Set(traditionalCharset.characters);

/**
 * A Traditional character the source already contains was carried over, not
 * drifted into: Japanese statute titles such as 指定薬物及び医療等の用途を定める省令
 * are quoted verbatim and must stay that way.
 */
export function findTraditionalCharacter(text, source = "") {
  for (const character of text) {
    if (TRADITIONAL_CHARSET.has(character) && !source.includes(character)) return character;
  }
  return null;
}

const HAN = /[\u4E00-\u9FFF]/u;
const LATIN_WORD = /[A-Za-z]{3,}/g;

/**
 * Prose worth translating, as opposed to a name, a statute citation, or a
 * measurement. "Anton Köllisch", "58 nM (norquetiapine)", and
 * "A.R.S. §§ 13-3401(6)(c)(xliii)" come back unchanged from any honest
 * translator, so they must not read as a defect. Lowercase-word counting cannot
 * tell them apart from prose: a chemical name, a roman numeral, and the tail of
 * an accented surname all look like words. An English function word cannot be
 * faked that way, and no real sentence lacks one.
 */
const FUNCTION_WORDS =
  /\b(?:the|and|with|for|from|that|which|are|is|was|were|been|be|may|can|not|this|these|those|has|have|had|than|then|when|after|before|under|into|more|most|also|such|both|each|per|over|between|during|without|including|its|their|his|her|it|as|at|by|of|on|in|to|or|but|if|while|about|through|because|although|however)\b/i;

export function looksTranslatable(text) {
  return FUNCTION_WORDS.test(text.replace(CITE_MARKER, " "));
}

export function hasChinese(text) {
  return HAN.test(text);
}

function latinWordRatio(source, target) {
  const sourceWords = source.match(LATIN_WORD) ?? [];
  if (sourceWords.length === 0) return 0;
  const targetWords = new Set((target.match(LATIN_WORD) ?? []).map((word) => word.toLowerCase()));
  const carried = sourceWords.filter((word) => targetWords.has(word.toLowerCase()));
  return carried.length / sourceWords.length;
}

/**
 * @param {object} input
 * @param {string} input.source - English source segment
 * @param {string} input.target - model output
 * @param {object} input.locale - locale config (script gate, length band)
 * @param {Record<string, string>} [input.glossary] - approved `term -> target` map to hold the segment to
 * @returns {{defects: string[], details: object}}
 */
export function validateSegment({ source, target, locale, glossary = {}, markup = false }) {
  const defects = [];
  const details = {};

  if (typeof target !== "string") {
    return { defects: [DEFECT_CODES.UNPARSABLE_OUTPUT], details: { reason: `type ${typeof target}` } };
  }

  const trimmed = target.trim();
  if (trimmed.length === 0) {
    return { defects: [DEFECT_CODES.EMPTY_OUTPUT], details: {} };
  }

  const numbers = compareNumbers(source, trimmed);
  if (numbers.dropped.length > 0) {
    defects.push(DEFECT_CODES.NUMBER_MISMATCH);
    details.droppedNumbers = numbers.dropped;
  }
  if (numbers.added.length > 0) {
    defects.push(DEFECT_CODES.NUMBER_ADDED);
    details.addedNumbers = numbers.added;
  }

  const sourceMarkers = extractCiteMarkers(source);
  const targetMarkers = extractCiteMarkers(trimmed);
  if (sourceMarkers.join("|") !== targetMarkers.join("|")) {
    defects.push(DEFECT_CODES.CITATION_LOSS);
    details.citations = { source: sourceMarkers, target: targetMarkers };
  }

  // A field holds one markup language, and the two look alike enough that
  // running both gates on one segment reports every correct translation as
  // broken. VCode's `[sup](common)` reads as a Markdown link, and Markdown's
  // `[CC0](/docs/license)` reads as a VCode tag. So: markup fields get the tag
  // gate, everything else gets the link-target gate.
  if (markup) {
    // Chinese word order moves an emphasis span or a link, which is fine.
    // Losing one, inventing one, or rewriting a target is not.
    const sourceMarkup = markupTokens(source);
    const targetMarkup = markupTokens(trimmed);
    if (sourceMarkup.join("|") !== targetMarkup.join("|")) {
      defects.push(DEFECT_CODES.MARKUP_LOSS);
      details.markup = { source: sourceMarkup, target: targetMarkup };
    }
  } else {
    // In Markdown copy the label is prose and the target is a route.
    // Translating a route silently breaks it.
    const sourceTargets = linkTargets(source);
    const targetTargets = linkTargets(trimmed);
    if (sourceTargets.join("|") !== targetTargets.join("|")) {
      defects.push(DEFECT_CODES.MARKUP_LOSS);
      details.linkTargets = { source: sourceTargets, target: targetTargets };
    }
  }

  // Copy blocks interpolate counts and names at render. An unmatched token is
  // printed literally on the page, so a translated brace is a visible defect.
  const sourcePlaceholders = placeholderTokens(source);
  const targetPlaceholders = placeholderTokens(trimmed);
  if (sourcePlaceholders.join("|") !== targetPlaceholders.join("|")) {
    defects.push(DEFECT_CODES.PLACEHOLDER_LOSS);
    details.placeholders = { source: sourcePlaceholders, target: targetPlaceholders };
  }

  const translatable = looksTranslatable(source);

  if (locale.scriptGate === "simplified") {
    const leak = findTraditionalCharacter(trimmed, source);
    if (leak) {
      defects.push(DEFECT_CODES.SCRIPT_LEAK);
      details.scriptLeak = leak;
    }
    if (translatable && !hasChinese(trimmed)) {
      defects.push(DEFECT_CODES.UNTRANSLATED);
    }
  }

  if (locale.scriptGate !== "simplified" && translatable && latinWordRatio(source, trimmed) > 0.9 && source.length > 40) {
    defects.push(DEFECT_CODES.UNTRANSLATED);
  }

  // A segment with nothing to translate keeps its source length, so the band
  // would fire on every name and statute citation.
  const ratio = trimmed.length / Math.max(source.length, 1);
  const [low, high] = locale.lengthBand;
  if (translatable && (ratio < low || ratio > high)) {
    defects.push(DEFECT_CODES.LENGTH_BAND);
    details.lengthRatio = Number(ratio.toFixed(3));
  }

  const glossaryMisses = [];
  for (const [term, expected] of Object.entries(glossary)) {
    const termPattern = glossaryTermPattern(term);
    if (termPattern.test(source) && !trimmed.includes(expected)) {
      glossaryMisses.push(term);
    }
  }
  if (glossaryMisses.length > 0) {
    defects.push(DEFECT_CODES.GLOSSARY_MISS);
    details.glossaryMisses = glossaryMisses;
  }

  return { defects, details };
}

/** Defects that must never survive into a published artifact. */
export const BLOCKING_DEFECTS = Object.freeze([
  DEFECT_CODES.EMPTY_OUTPUT,
  DEFECT_CODES.UNPARSABLE_OUTPUT,
  DEFECT_CODES.NUMBER_MISMATCH,
  DEFECT_CODES.SCRIPT_LEAK,
  DEFECT_CODES.UNTRANSLATED,
  DEFECT_CODES.CITATION_LOSS,
  DEFECT_CODES.MARKUP_LOSS,
  DEFECT_CODES.PLACEHOLDER_LOSS,
]);

export function isBlocking(defects) {
  return defects.some((code) => BLOCKING_DEFECTS.includes(code));
}

/**
 * Model replies arrive as a JSON object. Fences and prose around it are common
 * enough that stripping them is part of parsing, not a fallback.
 */
export function parseModelJson(raw) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, code: DEFECT_CODES.EMPTY_OUTPUT, value: null };
  }

  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return { ok: false, code: DEFECT_CODES.UNPARSABLE_OUTPUT, value: null };
  }

  try {
    return { ok: true, code: null, value: JSON.parse(text.slice(start, end + 1)) };
  } catch {
    return { ok: false, code: DEFECT_CODES.UNPARSABLE_OUTPUT, value: null };
  }
}
