import traditionalCharset from "./traditional-charset.json" with { type: "json" };

import { isLatinName } from "./locales.mjs";
import { mentionsTerm, termFinder } from "./term-match.mjs";
import { markupTokens, stripMarkup } from "./markup.mjs";

export const DEFECT_CODES = Object.freeze({
  EMPTY_OUTPUT: "EMPTY_OUTPUT",
  UNPARSABLE_OUTPUT: "UNPARSABLE_OUTPUT",
  NUMBER_MISMATCH: "NUMBER_MISMATCH",
  SCRIPT_LEAK: "SCRIPT_LEAK",
  UNTRANSLATED: "UNTRANSLATED",
  LENGTH_BAND: "LENGTH_BAND",
  GLOSSARY_MISS: "GLOSSARY_MISS",
  EXACT_TRANSLATION_MISMATCH: "EXACT_TRANSLATION_MISMATCH",
  CITATION_LOSS: "CITATION_LOSS",
  NUMBER_ADDED: "NUMBER_ADDED",
  MARKUP_LOSS: "MARKUP_LOSS",
  PLACEHOLDER_LOSS: "PLACEHOLDER_LOSS",
  REPEATED_PUNCTUATION: "REPEATED_PUNCTUATION",
  LEFTOVER_LATIN: "LEFTOVER_LATIN",
  TRANSPORT_FAILURE: "TRANSPORT_FAILURE",
});

const CITE_MARKER = /\[cite:[^\]]+\]|\[citation-needed\]/g;

export function extractCiteMarkers(text) {
  return (text.match(CITE_MARKER) ?? []).sort();
}

const PLACEHOLDER = /\{\{\s*[A-Za-z0-9_]+\s*\}\}/g;

export function placeholderTokens(text) {
  return (text.match(PLACEHOLDER) ?? []).map((token) => token.replace(/\s+/g, "")).sort();
}

const LINK_TARGET = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export function linkTargets(text) {
  return [...text.matchAll(LINK_TARGET)].map((match) => match[1]).sort();
}

const UNIT_SUFFIX =
  /(\d)\s*-?\s*(fold|mg|µg|ug|mcg|ng|kg|g|ml|l|mol|nm|um|%|hours?|hrs?|h|minutes?|mins?|min|seconds?|secs?|days?|weeks?|months?|years?)\b/gi;

const LOCANT_SET = /\d+(?:,\d+)+\s*-/g;

function stripNonMeasurementDigits(text) {
  return text
    .replace(CITE_MARKER, " ")
    .replace(UNIT_SUFFIX, "$1 $2 ")
    .replace(LOCANT_SET, " ")
    .replace(/(?<![:\d])5-(?=羟色胺)/gu, " ")
    .replace(/\d[A-Za-z0-9.\u0370-\u03ff,[\]-]*[A-Za-z\u0370-\u03ff][A-Za-z0-9.\u0370-\u03ff,[\]-]*/g, " ")
    .replace(/[A-Za-z\u0370-\u03ff][A-Za-z0-9.\u0370-\u03ff,[\]-]*\d[A-Za-z0-9.\u0370-\u03ff,[\]-]*/g, " ");
}

const SCALE_WORDS = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };

function normalizeDigits(text) {
  return stripNonMeasurementDigits(text).replace(/[\uff10-\uff19]/g, (digit) =>
    String.fromCharCode(digit.charCodeAt(0) - 0xfee0),
  );
}

const RANGE_GAP = /^[\s$€£¥]*(?:to|and|or|through|[-–—~])?[\s$€£¥]*$/i;

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

export function extractNumbers(text) {
  return extractNumberTokens(text).map((token) => token.value);
}

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

export function chineseNumeralForms(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || (number > 99 && number !== 100)) return [];
  if (number === 2) return ["二", "两"];
  if (number === 100) return ["一百", "百分之百"];
  if (number < 10) return [CHINESE_DIGITS[number]];
  const tens = Math.floor(number / 10);
  const ones = number % 10;
  const head = tens === 1 ? "十" : `${CHINESE_DIGITS[tens]}十`;
  return [ones === 0 ? head : `${head}${CHINESE_DIGITS[ones]}`];
}

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
    const unpadded = value.replace(/^0+(?=\d)/, "");
    if (unpadded !== value && consume(unpadded)) continue;
    const dateParts = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
    if (dateParts && dateParts.slice(1).every((part) => consume(part) || consume(part.replace(/^0+(?=\d)/, "")))) continue;
    if (scale === 1 && /^\d+0000$/.test(unpadded)) {
      const wan = String(Number(unpadded) / 1e4);
      if (consume(wan) || chineseNumeralForms(wan).some((form) => target.includes(`${form}万`))) continue;
    }
    dropped.push(value);
  }

  const added = [...targetCounts.entries()].flatMap(([value, count]) => Array(count).fill(value));
  return { dropped, added, sourceNumbers: sourceTokens.map((token) => token.value) };
}

const TRADITIONAL_CHARSET = new Set(traditionalCharset.characters);

export function findTraditionalCharacter(text, source = "") {
  const characters = Array.from(text);
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (character === "噁" && characters[index + 1] === "唑") continue;
    if (TRADITIONAL_CHARSET.has(character) && !source.includes(character)) return character;
  }
  return null;
}

const HAN = /[\u4E00-\u9FFF]/u;
const LATIN_WORD = /[A-Za-z]{3,}/g;

const FUNCTION_WORDS =
  /\b(?:the|and|with|for|from|that|which|are|is|was|were|been|be|may|can|not|this|these|those|has|have|had|than|then|when|after|before|under|into|more|most|also|such|both|each|per|over|between|during|without|including|its|their|his|her|it|as|at|by|of|on|in|to|or|but|if|while|about|through|because|although|however)\b/i;

export function looksTranslatable(text) {
  return FUNCTION_WORDS.test(text.replace(CITE_MARKER, " "));
}

export function hasChinese(text) {
  return HAN.test(text);
}

const FULL_WIDTH_MARKS = { "，": ",", "。": ".", "、": ",", "；": ";", "：": ":", "！": "!", "？": "?" };
const REPEATED_MARKS = /[，。、；：！？](?:\s*[，。、；：！？])+/gu;

export function findRepeatedPunctuation(source, target) {
  const runs = new Set();
  for (const [match] of target.matchAll(REPEATED_MARKS)) {
    const run = match.replace(/\s+/g, "");
    const ascii = Array.from(run, (mark) => FULL_WIDTH_MARKS[mark]).join("");
    if (source.includes(run) || source.includes(ascii)) continue;
    runs.add(run);
  }
  return [...runs];
}

const LATIN_TOKEN = /[A-Za-z0-9À-ɏ]+(?:['’.-][A-Za-z0-9À-ɏ]+)*/gu;
const LEFTOVER_MIN_LETTERS = 4;

function latinWords(text) {
  return text.match(/[A-Za-z]{3,}/g) ?? [];
}

const keptFinders = new WeakMap();
function keptFinder(glossary, latinNames) {
  let byNames = keptFinders.get(glossary);
  if (!byNames) keptFinders.set(glossary, (byNames = new WeakMap()));
  let finder = byNames.get(latinNames);
  if (!finder) {
    finder = termFinder([...Object.values(glossary).flatMap(latinWords), ...[...latinNames].flatMap(latinWords)]);
    byNames.set(latinNames, finder);
  }
  return finder;
}

export function findLeftoverLatin({ source, target, glossary = {}, latinNames = [], markup = false }) {
  let text = target
    .replace(CITE_MARKER, " ")
    .replace(PLACEHOLDER, " ")
    .replace(/\]\([^)]*\)/g, "] ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/<\/?[A-Za-z][^>]*>/g, " ")
    .replace(/[\w.*[\]-]*\/[\w.*[\]/-]*/g, " ")
    .replace(/（[^（）]*）|\([^()]*\)/g, " ");
  if (markup) text = stripMarkup(text);

  const keptIn = keptFinder(glossary, latinNames);
  const found = [];
  for (const [token] of text.matchAll(LATIN_TOKEN)) {
    if (/\d|[A-Za-z]\.[A-Za-z]/.test(token)) continue;
    for (const word of token.match(/[A-Za-zÀ-ɏ]+/gu) ?? []) {
      if (word.length < LEFTOVER_MIN_LETTERS || found.includes(word)) continue;
      if (isLatinName(word, source)) continue;
      if (keptIn(word).length > 0) continue;
      found.push(word);
    }
  }
  return found;
}

function latinWordRatio(source, target) {
  const sourceWords = source.match(LATIN_WORD) ?? [];
  if (sourceWords.length === 0) return 0;
  const targetWords = new Set((target.match(LATIN_WORD) ?? []).map((word) => word.toLowerCase()));
  const carried = sourceWords.filter((word) => targetWords.has(word.toLowerCase()));
  return carried.length / sourceWords.length;
}

export function validateSegment({ source, target, locale, glossary = {}, markup = false, exactTarget, latinNames = [] }) {
  const defects = [];
  const details = {};

  if (typeof target !== "string") {
    return { defects: [DEFECT_CODES.UNPARSABLE_OUTPUT], details: { reason: `type ${typeof target}` } };
  }

  const trimmed = target.trim();
  if (trimmed.length === 0) {
    return { defects: [DEFECT_CODES.EMPTY_OUTPUT], details: {} };
  }

  if (exactTarget !== undefined && trimmed !== exactTarget.trim()) {
    defects.push(DEFECT_CODES.EXACT_TRANSLATION_MISMATCH);
    details.exactTranslation = { expected: exactTarget, actual: trimmed };
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

  if (markup) {
    const sourceMarkup = markupTokens(source);
    const targetMarkup = markupTokens(trimmed);
    if (sourceMarkup.join("|") !== targetMarkup.join("|")) {
      defects.push(DEFECT_CODES.MARKUP_LOSS);
      details.markup = { source: sourceMarkup, target: targetMarkup };
    }
  } else {
    const sourceTargets = linkTargets(source);
    const targetTargets = linkTargets(trimmed);
    if (sourceTargets.join("|") !== targetTargets.join("|")) {
      defects.push(DEFECT_CODES.MARKUP_LOSS);
      details.linkTargets = { source: sourceTargets, target: targetTargets };
    }
  }

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
    const leftover = hasChinese(trimmed) ? findLeftoverLatin({ source, target: trimmed, glossary, latinNames, markup }) : [];
    if (leftover.length > 0) {
      defects.push(DEFECT_CODES.LEFTOVER_LATIN);
      details.leftoverLatin = leftover;
    }
  }

  const repeatedPunctuation = findRepeatedPunctuation(source, trimmed);
  if (repeatedPunctuation.length > 0) {
    defects.push(DEFECT_CODES.REPEATED_PUNCTUATION);
    details.repeatedPunctuation = repeatedPunctuation;
  }

  if (locale.scriptGate !== "simplified" && translatable && latinWordRatio(source, trimmed) > 0.9 && source.length > 40) {
    defects.push(DEFECT_CODES.UNTRANSLATED);
  }

  const ratio = trimmed.length / Math.max(source.length, 1);
  const [low, high] = locale.lengthBand;
  if (translatable && (ratio < low || ratio > high)) {
    defects.push(DEFECT_CODES.LENGTH_BAND);
    details.lengthRatio = Number(ratio.toFixed(3));
  }

  const glossaryMisses = [];
  for (const [term, expected] of Object.entries(glossary)) {
    if (mentionsTerm(source, term) && !trimmed.includes(expected)) {
      glossaryMisses.push(term);
    }
  }
  if (glossaryMisses.length > 0) {
    defects.push(DEFECT_CODES.GLOSSARY_MISS);
    details.glossaryMisses = glossaryMisses;
  }

  return { defects, details };
}

export const BLOCKING_DEFECTS = Object.freeze([
  DEFECT_CODES.EXACT_TRANSLATION_MISMATCH,
  DEFECT_CODES.EMPTY_OUTPUT,
  DEFECT_CODES.UNPARSABLE_OUTPUT,
  DEFECT_CODES.NUMBER_MISMATCH,
  DEFECT_CODES.SCRIPT_LEAK,
  DEFECT_CODES.UNTRANSLATED,
  DEFECT_CODES.CITATION_LOSS,
  DEFECT_CODES.MARKUP_LOSS,
  DEFECT_CODES.PLACEHOLDER_LOSS,
  DEFECT_CODES.REPEATED_PUNCTUATION,
]);

export function isBlocking(defects) {
  return defects.some((code) => BLOCKING_DEFECTS.includes(code));
}

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
