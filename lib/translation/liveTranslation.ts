import "server-only";

import { createHash } from "node:crypto";

import { parseRawVCodeContent } from "../../src/features/effects/vcode/normalize";
import { CORPORA, type CorpusDescriptor } from "../../scripts/translation/corpora.mjs";
import { DEFAULT_MODEL, planBatches, translateBatchWithRetries, type SegmentVerdict, type WorkUnit } from "../../scripts/translation/engine.mjs";
import { LOCALES, glossaryTermPattern, resolveLocale, type TranslationLocale } from "../../scripts/translation/locales.mjs";
import { assembleLocaleDataset, buildWorkUnits, extractSegments, type Segment } from "../../scripts/translation/segment-manifest.mjs";
import { isBlocking } from "../../scripts/translation/validate.mjs";
import { glossaryDigestInput, readGlossaryRows, type Glossary, type TranslationGlossaryRow } from "./glossary";
import { glossDigestInput, loadGlosses } from "./glossaryGloss";
import { loadApprovedStyleGuide } from "./approvedStyleGuide";
import type { StyleGuide } from "./styleGuideTypes";
import {
  clearTranslationRejections,
  pendingTranslationHashes,
  readTranslations,
  writeTranslationRejections,
  type TranslationSegmentRow,
} from "./segmentStore";
import type { PublicDataReadAdapter } from "../data/publicData.reads";
import { LIBRARY_TRANSLATION_CORPUS } from "./publicationIndexProjection";
import { approvedNarrativeOverlay } from "./narrativeOverlay";
import { pageReviewState, type PageReviewState } from "./pageReview";
import { isPublishableReplication } from "../../src/types/replications";
import { createTranslationRequestPool, type TranslationRequestPool } from "./requestPool";
import { soloClaim, type TranslationWave } from "./translationWave";

export { createTranslationWave, type TranslationWave } from "./translationWave";

export type TranslationRecordKind = "article" | "effect" | "report" | "library" | "replication" | "profile";

export const TRANSLATION_RECORD_KINDS: readonly TranslationRecordKind[] = [
  "article",
  "effect",
  "report",
  "library",
  "replication",
  "profile",
];

const LIVE_SUBSTANCE_CORPUS = {
  ...CORPORA.substances,
  excludedKeys: [...CORPORA.substances.excludedKeys, "publicRevision", "section_gaps", "editorial_review"],
};

const LIVE_PROFILE_CORPUS = {
  id: "profiles",
  label: "Contributor profiles",
  dataset: "ContributorProfiles",
  itemKey: "slug",
  excludedGroups: [],
  excludedKeys: ["slug"],
  conditionalKeys: {},
  safetyGroups: [],
  markupFields: {},
};

const LIVE_CORPORA: Record<TranslationRecordKind, CorpusDescriptor> = {
  article: LIVE_SUBSTANCE_CORPUS,
  effect: { ...CORPORA.effects, excludedKeys: [...CORPORA.effects.excludedKeys] },
  report: { ...CORPORA.reports, excludedKeys: [...CORPORA.reports.excludedKeys] },
  library: LIBRARY_TRANSLATION_CORPUS,
  replication: { ...CORPORA.replications, excludedKeys: [...CORPORA.replications.excludedKeys] },
  profile: LIVE_PROFILE_CORPUS,
};

const CORPUS_PARSE: Partial<Record<TranslationRecordKind, NonNullable<NonNullable<Parameters<typeof assembleLocaleDataset>[3]>["parse"]>>> = {
  effect: parseRawVCodeContent,
  library: parseRawVCodeContent,
};

const PREFIXED_KINDS = ["effect", "report", "library", "replication", "profile"] as const;

export function parseTranslationJobSlug(jobSlug: string): { kind: TranslationRecordKind; slug: string } {
  for (const kind of PREFIXED_KINDS) {
    const prefix = `${kind}/`;
    if (jobSlug.startsWith(prefix)) return { kind, slug: jobSlug.slice(prefix.length) };
  }
  return { kind: "article", slug: jobSlug };
}

export function translationJobSlug(kind: TranslationRecordKind, slug: string): string {
  return kind === "article" ? slug : `${kind}/${slug}`;
}

export async function recordsMentioning(
  reads: PublicDataReadAdapter,
  terms: readonly string[],
): Promise<Array<{ kind: TranslationRecordKind; slug: string }>> {
  const patterns = terms.map((term) => glossaryTermPattern(term));
  const hits: Array<{ kind: TranslationRecordKind; slug: string }> = [];
  for (const kind of TRANSLATION_RECORD_KINDS) {
    for (const record of await publicRecords(reads, kind)) {
      const segments = segmentsOf(record, kind);
      if (segments.some((segment) => patterns.some((pattern) => pattern.test(segment.source)))) hits.push({ kind, slug: record.slug });
    }
  }
  return hits;
}

export async function readTranslationRecord(
  reads: PublicDataReadAdapter,
  kind: TranslationRecordKind,
  slug: string,
): Promise<object | null> {
  switch (kind) {
    case "article":
      return reads.getPublicSubstanceBySlug(slug);
    case "effect":
      return reads.getPublicEffectBySlug(slug);
    case "report":
      return reads.getPublicTripReportBySlug(slug);
    case "library": {
      const article = await reads.getPublicEffectIndexArticleBySlug(slug);
      return article && article.kind !== "blog" ? article : null;
    }
    case "replication": {
      const replication = await reads.getPublicReplicationBySlug(slug);
      return replication && isPublishableReplication(replication) ? replication : null;
    }
    case "profile": {
      const profile = (await reads.getPublicContributorProfiles()).find(
        (candidate) => candidate.key.trim().toUpperCase() === slug.trim().toUpperCase(),
      );
      return profile ? { slug: profile.key, bio: profile.bio } : null;
    }
  }
}

export async function publicRecordSlugs(reads: PublicDataReadAdapter, kind: TranslationRecordKind): Promise<string[]> {
  switch (kind) {
    case "article":
      return reads.getPublicSubstanceSlugs();
    case "effect":
      return (await reads.getPublicEffects()).map(({ slug }) => slug);
    case "report":
      return (await reads.getPublicTripReportRecords()).map(({ slug }) => slug);
    case "library":
      return (await reads.getPublishedEffectIndexArticles())
        .filter((article) => article.kind !== "blog")
        .map(({ slug }) => slug);
    case "replication":
      return (await reads.getPublicReplications())
        .filter((replication) => isPublishableReplication(replication))
        .map(({ slug }) => slug);
    case "profile":
      return (await reads.getPublicContributorProfiles()).map(({ key }) => key);
  }
}

export async function publicRecords(
  reads: PublicDataReadAdapter,
  kind: TranslationRecordKind,
): Promise<Array<{ slug: string } & Record<string, unknown>>> {
  type PublicRecord = { slug: string } & Record<string, unknown>;
  switch (kind) {
    case "profile":
      return (await reads.getPublicContributorProfiles()).map((profile) => ({
        slug: profile.key,
        bio: profile.bio,
      })) as PublicRecord[];
    case "report":
      return (await reads.getPublicTripReportRecords()) as unknown as PublicRecord[];
    case "library":
      return (await reads.getPublishedEffectIndexArticles())
        .filter((article) => article.kind !== "blog") as unknown as PublicRecord[];
    case "replication":
      return (await reads.getPublicReplications())
        .filter((replication) => isPublishableReplication(replication)) as unknown as PublicRecord[];
    case "article":
    case "effect": {
      const slugs = await publicRecordSlugs(reads, kind);
      const records: PublicRecord[] = [];
      let cursor = 0;
      await Promise.all(Array.from({ length: 8 }, async () => {
        while (cursor < slugs.length) {
          const slug = slugs[cursor];
          cursor += 1;
          const record = await readTranslationRecord(reads, kind, slug);
          if (record) records.push({ ...(record as Record<string, unknown>), slug });
        }
      }));
      return records;
    }
  }
}

export const TRANSLATION_MODEL = DEFAULT_MODEL;

export const TRANSLATION_LOCALE_CODES: readonly string[] = Object.keys(LOCALES);

const REFRESH_CONCURRENCY = 8;

export type TranslationExecutionOptions = {
  signal?: AbortSignal;
  requestPool?: TranslationRequestPool;
  wave?: TranslationWave;
  onUsage?: (usage: { prompt: number; completion: number }) => void;
  onStored?: (count: number) => void;
};

export type TranslationContext = {
  locale: TranslationLocale;
  glossary: Glossary;
  kinds: Readonly<Record<string, string>>;
  glosses: Readonly<Record<string, string>>;
  styleGuide?: StyleGuide | null;
  promptVersion: string;
};

export function promptVersionFor(
  locale: TranslationLocale,
  glossary: Glossary,
  glosses: Readonly<Record<string, string>>,
  styleGuide: Pick<StyleGuide, "revision"> | null = null,
): string {
  const hash = createHash("sha256")
    .update(TRANSLATION_MODEL)
    .update("\u0000")
    .update(locale.systemPrompt)
    .update("\u0000")
    .update(glossaryDigestInput(glossary))
    .update("\u0000")
    .update(glossDigestInput(glosses));
  if (styleGuide?.revision) hash.update("\u0000style-guide\u0000").update(styleGuide.revision);
  return hash.digest("hex").slice(0, 16);
}

export function translationContextFromRows(
  localeCode: string,
  rows: readonly Pick<TranslationGlossaryRow, "term" | "target" | "kind" | "status">[],
  glosses: Readonly<Record<string, string>>,
  styleGuide: StyleGuide | null = null,
): TranslationContext {
  const locale = resolveLocale(localeCode);
  const approved = rows.filter((row) => row.status === "approved");
  const glossary: Glossary = Object.fromEntries(approved.map((row) => [row.term, row.target]));
  const kinds = Object.fromEntries(approved.map((row) => [row.term, row.kind]));
  return { locale, glossary, kinds, glosses, styleGuide, promptVersion: promptVersionFor(locale, glossary, glosses, styleGuide) };
}

export async function loadTranslationContext(localeCode: string): Promise<TranslationContext> {
  const [rows, glosses, styleGuide] = await Promise.all([
    readGlossaryRows(localeCode, { status: "approved" }),
    loadGlosses(),
    loadApprovedStyleGuide(localeCode),
  ]);
  return translationContextFromRows(localeCode, rows, glosses, styleGuide);
}

export function segmentsOf(record: { slug: string }, kind: TranslationRecordKind = "article"): Segment[] {
  return extractSegments({ items: [record as unknown as Record<string, unknown>] }, LIVE_CORPORA[kind]).segments;
}

export function workUnitsOf(segments: readonly Segment[], kind: TranslationRecordKind): WorkUnit[] {
  return buildWorkUnits(segments).map((unit) => ({ ...unit, contextKind: kind }));
}

export type LocalizedRecord<T> = { record: T; applied: number; missing: number; review: PageReviewState };

export async function localizeRecord<T extends { slug: string }>(
  record: T,
  localeCode: string,
  kind: TranslationRecordKind = "article",
): Promise<LocalizedRecord<T>> {
  const corpus = LIVE_CORPORA[kind];
  const segments = segmentsOf(record, kind);
  const translations = await readTranslations(localeCode, [...new Set(segments.map((segment) => segment.hash))]);
  const reviewed = await approvedNarrativeOverlay(localeCode, kind, segments, translations);
  const assembled = assembleLocaleDataset({ items: [record] }, reviewed.segments, reviewed.translations, {
    locale: localeCode,
    corpus,
    parse: CORPUS_PARSE[kind] ?? null,
  });
  return {
    record: assembled.dataset.items[0],
    applied: assembled.applied,
    missing: assembled.missing,
    review: pageReviewState(reviewed.decisions, reviewed.approvedAt),
  };
}

export async function localizeRecords<T extends { slug: string }>(
  records: readonly T[],
  localeCode: string,
  kind: TranslationRecordKind,
): Promise<{ records: T[]; applied: number; missing: number }> {
  const corpus = LIVE_CORPORA[kind];
  const items = records as unknown as Record<string, unknown>[];
  const segments = extractSegments({ items }, corpus).segments;
  const translations = await readTranslations(localeCode, [...new Set<string>(segments.map((segment: Segment) => segment.hash))]);
  const reviewed = await approvedNarrativeOverlay(localeCode, kind, segments, translations);
  const assembled = assembleLocaleDataset({ items }, reviewed.segments, reviewed.translations, {
    locale: localeCode,
    corpus,
    parse: CORPUS_PARSE[kind] ?? null,
  });
  return { records: assembled.dataset.items as T[], applied: assembled.applied, missing: assembled.missing };
}

export async function localizeDataset<T extends Record<string, unknown>>(
  dataset: { items: readonly T[] },
  corpus: CorpusDescriptor,
  localeCode: string,
): Promise<{ dataset: { items: T[] }; applied: number; missing: number }> {
  const items = dataset.items as T[];
  const segments = extractSegments({ items }, corpus).segments;
  const translations = await readTranslations(
    localeCode,
    [...new Set<string>(segments.map((segment: Segment) => segment.hash))],
  );
  const assembled = assembleLocaleDataset({ items }, segments, translations, {
    locale: localeCode,
    corpus,
  });
  return {
    dataset: assembled.dataset as { items: T[] },
    applied: assembled.applied,
    missing: assembled.missing,
  };
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

export async function translateUnits(
  units: readonly WorkUnit[],
  context: TranslationContext,
  apiKey: string,
  options: TranslationExecutionOptions = {},
): Promise<Pick<RefreshOutcome, "stored" | "rejected" | "usage">> {
  const { signal, wave } = options;
  const requestPool = options.requestPool ?? createTranslationRequestPool(REFRESH_CONCURRENCY);
  const { locale, glossary, kinds, glosses, styleGuide, promptVersion } = context;
  const localeCode = locale.code;
  const usage = { prompt: 0, completion: 0, requests: 0 };
  const rows: TranslationSegmentRow[] = [];
  const rejected: RefreshOutcome["rejected"] = [];
  const claim = wave ? wave.claim(localeCode, promptVersion, units) : soloClaim(units);

  const batches = planBatches(claim.owned);
  let cursor = 0;
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(requestPool.limit, batches.length) }, async () => {
      while (cursor < batches.length) {
        signal?.throwIfAborted();
        const batch = batches[cursor];
        cursor += 1;
        const verdicts = await requestPool.run<SegmentVerdict[]>(() => translateBatchWithRetries({
          units: batch,
          locale,
          glossary,
          kinds,
          glosses,
          styleGuide,
          model: TRANSLATION_MODEL,
          apiKey,
          signal,
          onUsage: (used) => {
            usage.prompt += used.prompt;
            usage.completion += used.completion;
            usage.requests += 1;
            options.onUsage?.(used);
          },
        }));
        const batchRows: TranslationSegmentRow[] = [];
        const batchRejected: RefreshOutcome["rejected"] = [];
        for (const verdict of verdicts) {
          if (isBlocking(verdict.defects) || verdict.target.length === 0) {
            batchRejected.push({ hash: verdict.unit.hash, defects: verdict.defects });
            continue;
          }
          batchRows.push({
            locale: localeCode,
            hash: verdict.unit.hash,
            source: verdict.unit.source,
            target: verdict.target,
            model: TRANSLATION_MODEL,
            prompt_version: promptVersion,
          });
        }
        await claim.settle(batchRows, batchRejected);
        if (batchRows.length > 0) options.onStored?.(batchRows.length);
        await Promise.all([
          clearTranslationRejections(localeCode, batchRows.map((row) => row.hash)),
          writeTranslationRejections(batchRejected.map((entry) => ({
            locale: localeCode,
            hash: entry.hash,
            source: batch.find((unit) => unit.hash === entry.hash)?.source ?? "",
            defects: entry.defects,
          }))),
        ]);
        rows.push(...batchRows);
        rejected.push(...batchRejected);
      }
    }),
  );

  const failure = results.find((result) => result.status === "rejected");
  claim.abandon(failure?.status === "rejected" ? failure.reason : new Error("Translation segment was never answered"));
  if (failure?.status === "rejected") throw failure.reason;
  signal?.throwIfAborted();
  const shared = await claim.shared();
  return { stored: rows.length + shared.stored, rejected: [...rejected, ...shared.rejected], usage };
}

export async function refreshRecordTranslations(
  record: { slug: string },
  context: TranslationContext,
  kind: TranslationRecordKind,
  apiKey: string,
  options: TranslationExecutionOptions = {},
): Promise<RefreshOutcome> {
  const { signal } = options;
  signal?.throwIfAborted();
  const localeCode = context.locale.code;
  const segments = segmentsOf(record, kind);
  const units = workUnitsOf(segments, kind);
  const pending = new Set(await pendingTranslationHashes(localeCode, units.map((unit) => unit.hash), context.promptVersion));
  const due = units.filter((unit) => pending.has(unit.hash));
  const result = due.length > 0
    ? await translateUnits(due, context, apiKey, options)
    : { stored: 0, rejected: [], usage: { prompt: 0, completion: 0, requests: 0 } };
  return { slug: record.slug, locale: localeCode, segments: segments.length, requested: due.length, ...result };
}
