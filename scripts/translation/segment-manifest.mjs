/**
 * Segment manifest for locale translation.
 *
 * A manifest is the list of things a run will pay to translate: one entry per
 * translatable leaf, with the path that put it there, the safety class of the
 * field group it belongs to, and a content hash. Identical English strings
 * share a hash and translate once.
 *
 * Two kinds of leaf exist. A plain leaf is a JSON string the walker found. A
 * markup leaf is one span inside a VCode body, cut at block boundaries so a
 * model receives a paragraph rather than a fragment, and spliced back at its
 * original offsets so everything the scanner did not select survives byte for
 * byte. Which fields hold markup is a property of the corpus, not of this
 * module.
 */

import { createHash } from "node:crypto";

import { CORPORA } from "./corpora.mjs";
import { scanVCode, spliceVCode, stripMarkup } from "./markup.mjs";
import { reconcileBody, RECONCILE_DEFECT } from "./reconcile.mjs";

export {
  SUBSTANCE_EXCLUDED_GROUPS as EXCLUDED_GROUPS,
  SUBSTANCE_EXCLUDED_KEYS as EXCLUDED_KEYS,
  SUBSTANCE_CONDITIONAL_KEYS as CONDITIONAL_KEYS,
  SUBSTANCE_SAFETY_GROUPS as SAFETY_GROUPS,
} from "./corpora.mjs";

/** "20-30 mg", "4 hours", "1.2-2.5h": a measurement, not a sentence. */
const BARE_MEASUREMENT =
  /^[\s(<>~≈+-]*\d[\d\s.,:/xX*+-]*(?:to|and|or)?[\s\d.,:/-]*(?:%|mg|g|kg|ug|µg|mcg|ng|ml|l|mol|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s|days?|d|weeks?|wks?|months?|years?|yrs?)?[\s).]*$/i;
const HAS_LETTERS = /[A-Za-z]{2}/;
const LOOKS_LIKE_URL = /^(?:https?:\/\/|www\.|mailto:)/i;

/** A leaf worth sending to a translation model. */
export function isTranslatableValue(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;
  if (LOOKS_LIKE_URL.test(trimmed)) return false;
  if (!HAS_LETTERS.test(trimmed)) return false;
  if (BARE_MEASUREMENT.test(trimmed)) return false;
  return true;
}

export function segmentHash(text) {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

function formatPath(pointer) {
  return pointer
    .map((part, index) => {
      if (typeof part === "number") return `[${part}]`;
      return index === 0 ? part : `.${part}`;
    })
    .join("");
}

export function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Walks one item and appends its translatable leaves. Object keys are visited
 * in sorted order so the manifest does not inherit key order from upstream.
 */
function walkValue(value, pointer, corpus, sink) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkValue(entry, [...pointer, index], corpus, sink));
    return;
  }

  if (value && typeof value === "object") {
    for (const key of Object.keys(value).sort()) {
      if (corpus.excludedKeySet.has(key)) continue;
      const requiredSibling = corpus.conditionalKeys[key];
      if (requiredSibling && typeof value[requiredSibling] !== "string") continue;
      if (requiredSibling && value[requiredSibling].trim().length === 0) continue;
      walkValue(value[key], [...pointer, key], corpus, sink);
    }
    return;
  }

  if (!isTranslatableValue(value)) return;
  sink(pointer, value);
}

/** Precomputed lookups, so a corpus descriptor stays a plain object. */
function prepare(corpus) {
  return {
    ...corpus,
    excludedGroupSet: new Set(corpus.excludedGroups ?? []),
    excludedKeySet: new Set(corpus.excludedKeys ?? []),
    safetyGroupSet: new Set(corpus.safetyGroups ?? []),
    conditionalKeys: corpus.conditionalKeys ?? {},
    markupFields: corpus.markupFields ?? {},
  };
}

/**
 * @param {object} dataset - a published export or a Postgres-backed envelope
 * @param {object} [corpusInput] - corpus descriptor; defaults to the substance index
 * @returns {{segments: Array, counts: object}}
 */
export function extractSegments(dataset, corpusInput = CORPORA.substances) {
  const corpus = prepare(corpusInput);
  const itemKey = corpus.itemKey ?? "slug";
  const items = [...(dataset.items ?? [])].sort((a, b) =>
    String(a[itemKey]).localeCompare(String(b[itemKey])),
  );
  const segments = [];
  const groupWords = {};
  const excludedWords = {};

  for (const item of items) {
    const id = String(item[itemKey]);

    for (const group of Object.keys(item).sort()) {
      if (corpus.excludedGroupSet.has(group) || corpus.excludedKeySet.has(group)) {
        excludedWords[group] = (excludedWords[group] ?? 0) + countJsonWords(item[group]);
        continue;
      }

      // A derived syntax tree is never translated and never sent anywhere.
      if (Object.values(corpus.markupFields).includes(group)) {
        excludedWords[group] = (excludedWords[group] ?? 0) + countJsonWords(item[group]);
        continue;
      }

      const contextClass = corpus.safetyGroupSet.has(group) ? "safety" : "prose";

      if (corpus.markupFields[group]) {
        const raw = item[group];
        if (typeof raw !== "string" || raw.trim().length === 0) continue;
        scanVCode(raw).forEach((span, spanIndex) => {
          if (!isTranslatableValue(stripMarkup(span.text))) return;
          segments.push({
            slug: id,
            path: `${group}#${spanIndex}`,
            pointer: [group],
            span: { index: spanIndex, start: span.start, end: span.end, kind: span.kind },
            group,
            markup: true,
            contextClass,
            hash: segmentHash(span.text),
            words: countWords(span.text),
            source: span.text,
          });
          groupWords[group] = (groupWords[group] ?? 0) + countWords(span.text);
        });
        continue;
      }

      walkValue(item[group], [group], corpus, (pointer, text) => {
        segments.push({
          slug: id,
          path: formatPath(pointer),
          pointer,
          group,
          markup: false,
          contextClass,
          hash: segmentHash(text),
          words: countWords(text),
          source: text,
        });
        groupWords[group] = (groupWords[group] ?? 0) + countWords(text);
      });
    }
  }

  const uniqueTexts = new Set(segments.map((segment) => segment.hash));
  const words = segments.reduce((total, segment) => total + segment.words, 0);

  return {
    segments,
    counts: {
      items: items.length,
      substances: items.length,
      segments: segments.length,
      uniqueTexts: uniqueTexts.size,
      words,
      markupSegments: segments.filter((segment) => segment.markup).length,
      safetySegments: segments.filter((segment) => segment.contextClass === "safety").length,
      groupWords: sortedRecord(groupWords),
      excludedWords: sortedRecord(excludedWords),
    },
  };
}

function sortedRecord(record) {
  return Object.fromEntries(Object.entries(record).sort((a, b) => b[1] - a[1]));
}

function countJsonWords(value) {
  if (typeof value === "string") return countWords(value);
  if (Array.isArray(value)) return value.reduce((total, entry) => total + countJsonWords(entry), 0);
  if (value && typeof value === "object") {
    return Object.values(value).reduce((total, entry) => total + countJsonWords(entry), 0);
  }
  return 0;
}

/**
 * Unique source texts, each carrying its most safety-critical context class and
 * the segments that share it. Identical English strings translate once and land
 * identically everywhere, which is the cheapest form of glossary consistency.
 */
export function buildWorkUnits(segments) {
  const byHash = new Map();

  for (const segment of segments) {
    const existing = byHash.get(segment.hash);
    if (!existing) {
      byHash.set(segment.hash, {
        hash: segment.hash,
        source: segment.source,
        contextClass: segment.contextClass,
        group: segment.group,
        markup: Boolean(segment.markup),
        words: segment.words,
        occurrences: 1,
      });
      continue;
    }
    existing.occurrences += 1;
    existing.markup = existing.markup || Boolean(segment.markup);
    if (segment.contextClass === "safety") {
      existing.contextClass = "safety";
      existing.group = segment.group;
    }
  }

  return [...byHash.values()].sort((a, b) => b.words - a.words || a.hash.localeCompare(b.hash));
}

export function buildManifest(dataset, { locale, source, corpus = CORPORA.substances }) {
  const { segments, counts } = extractSegments(dataset, corpus);
  const workUnits = buildWorkUnits(segments);

  return {
    locale,
    corpus: corpus.id,
    source,
    dataset: dataset.dataset ?? null,
    sourceGeneratedAt: dataset.generatedAt ?? null,
    excludedGroups: [...(corpus.excludedGroups ?? [])],
    excludedKeys: [...(corpus.excludedKeys ?? [])],
    safetyGroups: [...(corpus.safetyGroups ?? [])],
    markupFields: Object.keys(corpus.markupFields ?? {}),
    counts: { ...counts, workUnits: workUnits.length },
    segments,
  };
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function setAtPointer(root, pointer, value) {
  let node = root;
  for (let index = 0; index < pointer.length - 1; index += 1) {
    node = node?.[pointer[index]];
    if (node === undefined || node === null) return false;
  }
  const last = pointer[pointer.length - 1];
  if (node === undefined || node === null || node[last] === undefined) return false;
  node[last] = value;
  return true;
}

/**
 * Rebuilds the dataset with translated leaves in place. Structure, key order,
 * and every excluded value are inherited from the source, so the artifact is
 * the source shape with different strings in it.
 *
 * A markup body is spliced from its spans and then reconciled: the translated
 * raw is reparsed and its tree compared with the source tree. A body whose
 * tree moved keeps its English, because a broken document is worse than an
 * untranslated one. When a parser is supplied the derived `*_ast` field is
 * recomputed from the shipped raw, so the two can never disagree.
 */
export function assembleLocaleDataset(
  dataset,
  segments,
  translationsByHash,
  { locale, corpus = CORPORA.substances, parse = null } = {},
) {
  const output = cloneJson(dataset);
  const itemKey = corpus.itemKey ?? "slug";
  const markupFields = corpus.markupFields ?? {};
  const itemsById = new Map((output.items ?? []).map((item) => [String(item[itemKey]), item]));
  let applied = 0;
  let missing = 0;

  const markupBodies = new Map();

  for (const segment of segments) {
    if (segment.markup) {
      const key = `${segment.slug}\u0000${segment.group}`;
      if (!markupBodies.has(key)) markupBodies.set(key, { slug: segment.slug, field: segment.group, segments: [] });
      markupBodies.get(key).segments.push(segment);
      continue;
    }

    const translated = translationsByHash.get(segment.hash);
    if (typeof translated !== "string" || translated.length === 0) {
      missing += 1;
      continue;
    }
    const item = itemsById.get(segment.slug);
    if (!item) {
      missing += 1;
      continue;
    }
    applied += setAtPointer(item, segment.pointer, translated) ? 1 : 0;
  }

  const reconciliation = { bodies: 0, rejected: [], reparsed: 0 };

  for (const body of markupBodies.values()) {
    const item = itemsById.get(body.slug);
    const sourceRaw = dataset.items?.find((entry) => String(entry[itemKey]) === body.slug)?.[body.field];
    if (!item || typeof sourceRaw !== "string") {
      missing += body.segments.length;
      continue;
    }

    reconciliation.bodies += 1;
    const ordered = [...body.segments].sort((a, b) => a.span.index - b.span.index);
    const spans = scanVCode(sourceRaw);
    const byIndex = new Map(ordered.map((segment) => [segment.span.index, segment]));
    let appliedHere = 0;

    const translatedRaw = spliceVCode(sourceRaw, spans, (span, index) => {
      const segment = byIndex.get(index);
      if (!segment) return null;
      const translated = translationsByHash.get(segment.hash);
      if (typeof translated !== "string" || translated.length === 0) return null;
      appliedHere += 1;
      return translated;
    });

    if (parse) {
      const verdict = reconcileBody({ sourceRaw, targetRaw: translatedRaw, parse });
      if (!verdict.ok) {
        reconciliation.rejected.push({ slug: body.slug, field: body.field, ...verdict.details });
        missing += ordered.length;
        continue;
      }
    }

    item[body.field] = translatedRaw;
    applied += appliedHere;
    missing += ordered.length - appliedHere;

    const astField = markupFields[body.field];
    if (astField && parse && Object.prototype.hasOwnProperty.call(item, astField)) {
      item[astField] = parse(translatedRaw);
      reconciliation.reparsed += 1;
    }
  }

  output.locale = locale;
  output.translationOf = dataset.generatedAt ?? null;

  return { dataset: output, applied, missing, reconciliation };
}

/**
 * Structural equality between source and translated artifact: same keys, same
 * array lengths, same leaf types. Returns the first differing paths.
 *
 * Derived syntax trees are exempt: the pipeline deliberately rebuilds them from
 * the translated raw, so their internal string values move by design. Their
 * node structure is checked by the reconciler instead.
 */
export function structuralDiff(a, b, pointer = [], out = [], limit = 25, exemptKeys = new Set()) {
  if (out.length >= limit) return out;

  const typeA = Array.isArray(a) ? "array" : a === null ? "null" : typeof a;
  const typeB = Array.isArray(b) ? "array" : b === null ? "null" : typeof b;

  if (typeA !== typeB) {
    out.push(`${formatPath(pointer) || "<root>"}: ${typeA} vs ${typeB}`);
    return out;
  }

  if (typeA === "array") {
    if (a.length !== b.length) {
      out.push(`${formatPath(pointer)}: length ${a.length} vs ${b.length}`);
      return out;
    }
    for (let index = 0; index < a.length; index += 1) {
      structuralDiff(a[index], b[index], [...pointer, index], out, limit, exemptKeys);
    }
    return out;
  }

  if (typeA === "object") {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.join("\u0000") !== keysB.join("\u0000")) {
      const onlyA = keysA.filter((key) => !keysB.includes(key));
      const onlyB = keysB.filter((key) => !keysA.includes(key));
      out.push(`${formatPath(pointer) || "<root>"}: keys differ (+${onlyB.join(",")} -${onlyA.join(",")})`);
      return out;
    }
    for (const key of keysA) {
      if (exemptKeys.has(key)) continue;
      structuralDiff(a[key], b[key], [...pointer, key], out, limit, exemptKeys);
    }
  }

  return out;
}

export { formatPath, RECONCILE_DEFECT };
