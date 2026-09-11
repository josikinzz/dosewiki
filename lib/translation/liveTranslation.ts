/**
 * Live locale mirrors of dose.wiki records: substance articles, effect
 * articles, and trip reports.
 *
 * The batch pipeline under `scripts/translation/` owns segmentation, the
 * prompt, validation, and the model call; this module runs the same pieces
 * against the runtime store instead of an export artifact. A record is cut
 * into segments keyed by content hash, the stored targets are spliced back
 * over a clone, and any segment without a stored target keeps its English
 * so a fresh edit never blanks a page. The refresh side translates only the
 * hashes the store lacks, always with the same model and system prompt, and
 * records the prompt digest so a deliberate prompt change can be replayed.
 */
import "server-only";

import { createHash } from "node:crypto";

import { parseRawVCodeContent } from "../../src/features/effects/vcode/normalize";
import { CORPORA } from "../../scripts/translation/corpora.mjs";
import { DEFAULT_MODEL, planBatches, translateBatchWithRetries, type WorkUnit } from "../../scripts/translation/engine.mjs";
import { resolveLocale, type TranslationLocale } from "../../scripts/translation/locales.mjs";
import { assembleLocaleDataset, buildWorkUnits, extractSegments, type Segment } from "../../scripts/translation/segment-manifest.mjs";
import { isBlocking } from "../../scripts/translation/validate.mjs";
import { missingTranslationHashes, readTranslations, writeTranslations, type TranslationSegmentRow } from "./segmentStore";

/** Which runtime record corpus a translation job addresses. */
export type TranslationRecordKind = "article" | "effect" | "report";

/** The batch corpus plus the runtime-only keys a public record carries that an export does not. */
const LIVE_SUBSTANCE_CORPUS = {
  ...CORPORA.substances,
  excludedKeys: [...CORPORA.substances.excludedKeys, "publicRevision", "section_gaps", "editorial_review"],
};

/**
 * Public effect and report records carry the same fields the open-data
 * exports segment, so the batch corpora apply unchanged. Effect bodies are
 * raw VCode beside a derived tree, so localization reparses the translated
 * raw into the tree field exactly as the batch run does.
 */
const LIVE_CORPORA: Record<TranslationRecordKind, typeof LIVE_SUBSTANCE_CORPUS> = {
  article: LIVE_SUBSTANCE_CORPUS,
  effect: { ...CORPORA.effects, excludedKeys: [...CORPORA.effects.excludedKeys] },
  report: { ...CORPORA.reports, excludedKeys: [...CORPORA.reports.excludedKeys] },
};

/** Effect bodies reconcile their derived `*_ast` trees against the translated raw. */
const CORPUS_PARSE: Partial<Record<TranslationRecordKind, NonNullable<Parameters<typeof assembleLocaleDataset>[3]["parse"]>>> = {
  effect: parseRawVCodeContent,
};

export const TRANSLATION_MODEL = DEFAULT_MODEL;

/** Requests in flight per refresh; a refresh runs inside one cron invocation, not a 100-wide batch run. */
const REFRESH_CONCURRENCY = 8;

export function getTranslationLocale(code: string): TranslationLocale {
  return resolveLocale(code);
}

/** Digest of everything that shapes an answer besides the segment itself. */
export function promptVersionFor(locale: TranslationLocale): string {
  return createHash("sha256")
    .update(TRANSLATION_MODEL)
    .update("\u0000")
    .update(locale.systemPrompt)
    .update("\u0000")
    .update(JSON.stringify(Object.entries(locale.glossary).sort(([a], [b]) => a.localeCompare(b))))
    .digest("hex")
    .slice(0, 16);
}

export function segmentsOf(record: { slug: string }, kind: TranslationRecordKind = "article"): Segment[] {
  return extractSegments({ items: [record as unknown as Record<string, unknown>] }, LIVE_CORPORA[kind]).segments;
}

export type LocalizedRecord<T> = { record: T; applied: number; missing: number };

/** The record with every stored translation spliced in; untranslated leaves stay English. */
export async function localizeRecord<T extends { slug: string }>(
  record: T,
  localeCode: string,
  kind: TranslationRecordKind = "article",
): Promise<LocalizedRecord<T>> {
  const corpus = LIVE_CORPORA[kind];
  const segments = segmentsOf(record, kind);
  const translations = await readTranslations(localeCode, [...new Set(segments.map((segment) => segment.hash))]);
  const assembled = assembleLocaleDataset({ items: [record] }, segments, translations, {
    locale: localeCode,
    corpus,
    parse: CORPUS_PARSE[kind] ?? null,
  });
  return { record: assembled.dataset.items[0], applied: assembled.applied, missing: assembled.missing };
}

/** A whole set of records with stored translations spliced in, one store round trip. */
export async function localizeRecords<T extends { slug: string }>(
  records: readonly T[],
  localeCode: string,
  kind: TranslationRecordKind,
): Promise<{ records: T[]; applied: number; missing: number }> {
  const corpus = LIVE_CORPORA[kind];
  const items = records as unknown as Record<string, unknown>[];
  const segments = extractSegments({ items }, corpus).segments;
  const translations = await readTranslations(localeCode, [...new Set<string>(segments.map((segment: Segment) => segment.hash))]);
  const assembled = assembleLocaleDataset({ items }, segments, translations, {
    locale: localeCode,
    corpus,
    parse: CORPUS_PARSE[kind] ?? null,
  });
  return { records: assembled.dataset.items as T[], applied: assembled.applied, missing: assembled.missing };
}

export type RefreshOutcome = {
  slug: string;
  locale: string;
  segments: number;
  requested: number;
  stored: number;
  rejected: { hash: string; defects: string[] }[];
  usage: { prompt: number; completion: number; requests: number };
};

/**
 * Translate the work units the store lacks and persist the ones that pass
 * every blocking check. A rejected unit is reported, not stored: its English
 * keeps rendering, and the next refresh tries it again.
 */
export async function translateUnits(
  units: readonly WorkUnit[],
  localeCode: string,
  apiKey: string,
): Promise<Pick<RefreshOutcome, "stored" | "rejected" | "usage">> {
  const locale = getTranslationLocale(localeCode);
  const promptVersion = promptVersionFor(locale);
  const usage = { prompt: 0, completion: 0, requests: 0 };
  const rows: TranslationSegmentRow[] = [];
  const rejected: RefreshOutcome["rejected"] = [];

  const batches = planBatches(units);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(REFRESH_CONCURRENCY, batches.length) }, async () => {
      while (cursor < batches.length) {
        const batch = batches[cursor];
        cursor += 1;
        const verdicts = await translateBatchWithRetries({
          units: batch,
          locale,
          model: TRANSLATION_MODEL,
          apiKey,
          onUsage: (used) => {
            usage.prompt += used.prompt;
            usage.completion += used.completion;
            usage.requests += 1;
          },
        });
        for (const verdict of verdicts) {
          if (isBlocking(verdict.defects) || verdict.target.length === 0) {
            rejected.push({ hash: verdict.unit.hash, defects: verdict.defects });
            continue;
          }
          rows.push({
            locale: localeCode,
            hash: verdict.unit.hash,
            source: verdict.unit.source,
            target: verdict.target,
            model: TRANSLATION_MODEL,
            prompt_version: promptVersion,
          });
        }
      }
    }),
  );

  await writeTranslations(rows);
  return { stored: rows.length, rejected, usage };
}

/** Bring one record's locale up to date with its current English. */
export async function refreshRecordTranslations(
  record: { slug: string },
  localeCode: string,
  kind: TranslationRecordKind,
  apiKey: string,
): Promise<RefreshOutcome> {
  const segments = segmentsOf(record, kind);
  const units = buildWorkUnits(segments);
  const missing = new Set(await missingTranslationHashes(localeCode, units.map((unit) => unit.hash)));
  const pending = units.filter((unit) => missing.has(unit.hash));
  const result = pending.length > 0
    ? await translateUnits(pending, localeCode, apiKey)
    : { stored: 0, rejected: [], usage: { prompt: 0, completion: 0, requests: 0 } };
  return { slug: record.slug, locale: localeCode, segments: segments.length, requested: pending.length, ...result };
}
