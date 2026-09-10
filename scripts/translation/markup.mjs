/**
 * VCode-aware segmentation.
 *
 * Effect and article bodies are stored as VCode markup in a `*_raw` string. A
 * JSON leaf walker would hand the whole document to a translation model and
 * hope the markup came back intact. This module instead cuts the document at
 * block boundaries, so a model receives one paragraph of prose with its inline
 * emphasis and links still attached, and every block tag, attribute, link
 * target and citation key stays exactly where the source put it.
 *
 * Spans carry absolute offsets into the source string. Splicing translated text
 * back at those offsets is byte-exact for anything the scanner did not select,
 * which is what makes an untranslated round trip reproduce the source.
 *
 * The tag vocabulary is imported from the renderer's own parser rather than
 * restated here, because a tag this module does not know is a tag it would
 * silently hand to a model as prose.
 */

import { VCODE_TAG_NAMES, HASH_DIRECTIVE_ALIASES } from "../../src/features/effects/vcode/normalize.ts";

const TAG_PATTERN = /\[(\/?)([a-z][\w-]*)([^\]]*)\]/gi;
const VOID_TAGS = new Set(["br", "hr", "ref", "toc"]);

/**
 * Tags that live inside a sentence. They travel with the prose that surrounds
 * them, because translating "An " and "abnormal heartbeat" and " is any of"
 * as three segments produces three fragments no Chinese sentence can be built
 * from. Everything else in the vocabulary opens a new segment.
 */
export const INLINE_TAGS = Object.freeze(
  new Set(["b", "i", "u", "s", "sup", "int-link", "ext-link", "ref", "br"]),
);

/**
 * Attribute values a reader sees. Every other attribute is a target, an
 * identifier, a colour, or a credit: `to`, `src`, `icon`, `id`, `artist`,
 * `author`, `profile`, `resource`, `no`, and the two textbox backgrounds.
 */
export const PROSE_ATTRIBUTES = Object.freeze({
  "headered-textbox": ["label", "header"],
  "separated-textbox": ["leftHeader", "rightHeader", "a", "b"],
  panel: ["title"],
  "captioned-image": ["title", "caption"],
  "audio-player": ["title"],
  "youtube-embed": ["title"],
  subarticle: ["title"],
  markdown: ["text"],
});

const HASH_NAME_PATTERN = /^[A-Za-z][\w-]*/;
const HASH_ATTRIBUTE_PATTERN = /^\|([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^|{\s]*))/;

function hasClosingTag(raw, name, fromIndex) {
  return new RegExp(`\\[/${name}\\s*\\]`, "i").test(raw.slice(fromIndex));
}

/**
 * Mirrors the parser: prose such as `[Alan Watts]` is literal text, not a node.
 * A bracket only opens a tag when the name is known, the tag self-closes, or a
 * matching closing tag follows.
 */
function isTagOpening(raw, name, rawAttributes, afterTagIndex) {
  if (VCODE_TAG_NAMES.has(name) || VOID_TAGS.has(name)) return true;
  return rawAttributes.trim().endsWith("/") || hasClosingTag(raw, name, afterTagIndex);
}

/** Offsets of one attribute's value inside a tag's attribute text. */
function attributeValueSpans(rawAttributes, offset, wanted) {
  const spans = [];
  const pattern = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/]+))/g;
  let match;
  while ((match = pattern.exec(rawAttributes)) !== null) {
    const [full, key, doubleQuoted, singleQuoted, bare] = match;
    if (!wanted.includes(key)) continue;
    const value = doubleQuoted ?? singleQuoted ?? bare ?? "";
    if (value.length === 0) continue;
    const valueStart = offset + match.index + full.length - value.length - (bare === undefined ? 1 : 0);
    spans.push({ kind: "attr", attribute: key, start: valueStart, end: valueStart + value.length, text: value });
  }
  return spans;
}

/** A text run, with its surrounding whitespace held back from the model. */
function pushTextSpan(spans, raw, start, end, container) {
  if (end <= start) return;
  const slice = raw.slice(start, end);
  const leading = slice.length - slice.trimStart().length;
  const trailing = slice.length - slice.trimEnd().length;
  const coreStart = start + leading;
  const coreEnd = end - trailing;
  if (coreEnd <= coreStart) return;
  spans.push({ kind: "text", start: coreStart, end: coreEnd, text: raw.slice(coreStart, coreEnd), container });
}

/**
 * Hash-dialect directives (`##quotation|author="Josie Kins"{...}`) appear
 * inside the bracket dialect's text runs. The header and its braces are
 * structure; the braced body is prose that may itself contain bracket tags.
 */
function scanHashRun(raw, start, end, container, spans) {
  let cursor = start;
  let textStart = start;

  while (cursor < end) {
    const at = raw.indexOf("##", cursor);
    if (at === -1 || at >= end) break;

    const nameMatch = HASH_NAME_PATTERN.exec(raw.slice(at + 2, end));
    if (!nameMatch) {
      cursor = at + 2;
      continue;
    }

    let headerEnd = at + 2 + nameMatch[0].length;
    const attributes = [];
    while (raw[headerEnd] === "|") {
      const attributeMatch = HASH_ATTRIBUTE_PATTERN.exec(raw.slice(headerEnd, end));
      if (!attributeMatch) break;
      const [matched, key, doubleQuoted, singleQuoted, bare] = attributeMatch;
      const value = doubleQuoted ?? singleQuoted ?? bare ?? "";
      if (value.length > 0) {
        const valueStart = headerEnd + matched.length - value.length - (bare === undefined ? 1 : 0);
        attributes.push({ key, start: valueStart, end: valueStart + value.length, text: value });
      }
      headerEnd += matched.length;
    }

    const name = HASH_DIRECTIVE_ALIASES[nameMatch[0].toLowerCase()] ?? nameMatch[0].toLowerCase();
    const wanted = PROSE_ATTRIBUTES[name] ?? [];

    pushTextSpan(spans, raw, textStart, at, container);
    for (const attribute of attributes) {
      if (!wanted.includes(attribute.key)) continue;
      spans.push({
        kind: "attr",
        attribute: attribute.key,
        start: attribute.start,
        end: attribute.end,
        text: attribute.text,
        container: name,
      });
    }

    if (raw[headerEnd] !== "{") {
      cursor = headerEnd;
      textStart = headerEnd;
      continue;
    }

    let depth = 0;
    let bodyEnd = -1;
    for (let index = headerEnd; index < end; index += 1) {
      if (raw[index] === "{") depth += 1;
      else if (raw[index] === "}") {
        depth -= 1;
        if (depth === 0) {
          bodyEnd = index;
          break;
        }
      }
    }
    if (bodyEnd === -1) {
      cursor = headerEnd + 1;
      textStart = headerEnd + 1;
      continue;
    }

    scanBracketRun(raw, headerEnd + 1, bodyEnd, name, spans);
    cursor = bodyEnd + 1;
    textStart = bodyEnd + 1;
  }

  pushTextSpan(spans, raw, textStart, end, container);
}

/**
 * Walks one region of bracket-dialect markup, emitting a span per text run
 * between block tags. Inline tags stay inside the run they interrupt.
 */
function scanBracketRun(raw, start, end, container, spans) {
  const pattern = new RegExp(TAG_PATTERN.source, "gi");
  pattern.lastIndex = start;

  let runStart = start;
  let match;

  while ((match = pattern.exec(raw)) !== null) {
    if (match.index >= end) break;
    const [full, closingSlash, rawName, rawAttributes] = match;
    const afterTag = match.index + full.length;
    if (afterTag > end) break;

    const name = rawName.toLowerCase();
    if (!isTagOpening(raw, name, rawAttributes, afterTag) && !closingSlash) continue;
    if (closingSlash && !VCODE_TAG_NAMES.has(name)) continue;
    if (INLINE_TAGS.has(name)) continue;

    scanHashRun(raw, runStart, match.index, container, spans);

    if (!closingSlash) {
      const wanted = PROSE_ATTRIBUTES[name];
      if (wanted) {
        const attributeOffset = match.index + 1 + closingSlash.length + rawName.length;
        spans.push(
          ...attributeValueSpans(rawAttributes, attributeOffset, wanted).map((span) => ({
            ...span,
            container: name,
          })),
        );
      }
    }

    runStart = afterTag;
  }

  scanHashRun(raw, runStart, end, container, spans);
}

/**
 * Every translatable span in a VCode body, in document order.
 *
 * @param {string} raw
 * @returns {Array<{kind: "text"|"attr", start: number, end: number, text: string, container?: string, attribute?: string}>}
 */
export function scanVCode(raw) {
  if (typeof raw !== "string" || raw.length === 0) return [];
  const spans = [];
  scanBracketRun(raw, 0, raw.length, null, spans);
  return spans.sort((a, b) => a.start - b.start);
}

/**
 * Rebuilds a body with translated spans in place. A span with no replacement
 * keeps its source text, so a partially translated body is still a valid one.
 *
 * @param {string} raw
 * @param {Array} spans - spans from scanVCode, in document order
 * @param {(span: object, index: number) => string|null|undefined} replacementFor
 */
export function spliceVCode(raw, spans, replacementFor) {
  let out = "";
  let cursor = 0;
  spans.forEach((span, index) => {
    const replacement = replacementFor(span, index);
    out += raw.slice(cursor, span.start);
    out += typeof replacement === "string" && replacement.length > 0 ? replacement : span.text;
    cursor = span.end;
  });
  return out + raw.slice(cursor);
}

/**
 * The prose left when the markup is taken away. A span that is only a citation
 * marker or a line break is structure wearing a text run's clothes, and paying
 * a model to look at it invites it to rewrite one.
 */
export function stripMarkup(text) {
  return text.replace(MARKUP_TOKEN, " ");
}

const MARKUP_TOKEN = /\[\/?[a-z][\w-]*[^\]]*\]/gi;

/**
 * Inline markup a translated segment must carry through unchanged. Compares
 * the tag tokens, not their order: Chinese word order moves an emphasis span,
 * and moving one is fine while losing one is not.
 */
export function markupTokens(text) {
  return (text.match(MARKUP_TOKEN) ?? []).map((token) => token.replace(/\s+/g, " ")).sort();
}
