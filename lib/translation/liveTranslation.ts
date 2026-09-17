/**
 * Live locale mirrors of dose.wiki records: substance articles, effect
 * articles, trip reports, the long-form library articles, and replication
 * media records.
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
import { LOCALES, glossaryTermPattern, resolveLocale, type TranslationLocale } from "../../scripts/translation/locales.mjs";
import { assembleLocaleDataset, buildWorkUnits, extractSegments, type Segment } from "../../scripts/translation/segment-manifest.mjs";
import { isBlocking } from "../../scripts/translation/validate.mjs";
import { glossaryDigestInput, readGlossaryRows, type Glossary, type TranslationGlossaryRow } from "./glossary";
import { glossDigestInput, loadGlosses } from "./glossaryGloss";
import {
  clearTranslationRejections,
  pendingTranslationHashes,
  readTranslations,
  writeTranslationRejections,
  writeTranslations,
  type TranslationSegmentRow,
} from "./segmentStore";
import type { PublicDataReadAdapter } from "../data/publicData.reads";
import { LIBRARY_TRANSLATION_CORPUS } from "./publicationIndexProjection";
import { isPublishableReplication } from "../../src/types/replications";

/** Which runtime record corpus a translation job addresses. */
export type TranslationRecordKind = "article" | "effect" | "report" | "library" | "replication" | "profile";

/** Every kind, in the order the operator tooling reports them. */
export const TRANSLATION_RECORD_KINDS: readonly TranslationRecordKind[] = [
  "article",
  "effect",
  "report",
  "library",
  "replication",
  "profile",
];

/** The batch corpus plus the runtime-only keys a public record carries that an export does not. */
const LIVE_SUBSTANCE_CORPUS = {
  ...CORPORA.substances,
  excludedKeys: [...CORPORA.substances.excludedKeys, "publicRevision", "section_gaps", "editorial_review"],
};

/** Contributor records are projected to `{ slug, bio }` before segmentation. */
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

/**
 * Public effect and report records carry the same fields the open-data
 * exports segment, so the batch corpora apply unchanged. Effect bodies are
 * raw VCode beside a derived tree, so localization reparses the translated
 * raw into the tree field exactly as the batch run does. A public library
 * article is the batch export plus `authors`, the legacy Mongo ObjectIds the
 * batch loader strips and no reader ever sees; its VCode body reparses into
 * `body_ast` the same way. A replication record's only prose is its title;
 * the corpus excludes every other field by name, so the gallery projection
 * and the full permalink record segment identically.
 */
const LIVE_CORPORA: Record<TranslationRecordKind, typeof LIVE_SUBSTANCE_CORPUS> = {
  article: LIVE_SUBSTANCE_CORPUS,
  effect: { ...CORPORA.effects, excludedKeys: [...CORPORA.effects.excludedKeys] },
  report: { ...CORPORA.reports, excludedKeys: [...CORPORA.reports.excludedKeys] },
  library: LIBRARY_TRANSLATION_CORPUS,
  replication: { ...CORPORA.replications, excludedKeys: [...CORPORA.replications.excludedKeys] },
  profile: LIVE_PROFILE_CORPUS,
};

/** Effect and library bodies reconcile their derived `*_ast` trees against the translated raw. */
const CORPUS_PARSE: Partial<Record<TranslationRecordKind, NonNullable<Parameters<typeof assembleLocaleDataset>[3]["parse"]>>> = {
  effect: parseRawVCodeContent,
  library: parseRawVCodeContent,
};

/** The job table keys every record by slug; the non-substance kinds carry a namespace prefix so one row always resolves to exactly one corpus. */
const PREFIXED_KINDS = ["effect", "report", "library", "replication", "profile"] as const;

/** The corpus and bare slug one `translationJobs` row addresses; a bare slug is a substance article. */
export function parseTranslationJobSlug(jobSlug: string): { kind: TranslationRecordKind; slug: string } {
  for (const kind of PREFIXED_KINDS) {
    const prefix = `${kind}/`;
    if (jobSlug.startsWith(prefix)) return { kind, slug: jobSlug.slice(prefix.length) };
  }
  return { kind: "article", slug: jobSlug };
}

/** The `translationJobs` slug for one record: bare for substances, kind-prefixed otherwise. */
export function translationJobSlug(kind: TranslationRecordKind, slug: string): string {
  return kind === "article" ? slug : `${kind}/${slug}`;
}

/**
 * Every public record, of every kind, with a segment that mentions any of
 * `terms` by the glossary matcher: the records a glossary edit can change.
 * Reads the whole corpus, as the coverage lens and the stale replay do.
 */
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

/**
 * The public record a job addresses, read uncached because the job exists
 * precisely when the cached record is stale. Null means nothing public carries
 * the slug: unpublished, renamed, a blog row asked for as a library article,
 * or a replication the public surfaces would not publish.
 */
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

/** Every slug the public surfaces currently publish for one kind: the enqueue-all set and the coverage denominator. */
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

/**
 * Every public record of one kind, for the whole-corpus passes (backfill,
 * coverage). Kinds with a plain bulk read use it; substances and effects only
 * list slugs or previews outside a Next process, so they are read by slug a
 * few at a time.
 */
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

/** Every locale the pipeline can translate into, live or not; the Glossary tab drafts for any of them. */
export const TRANSLATION_LOCALE_CODES: readonly string[] = Object.keys(LOCALES);

/** Requests in flight per refresh; a refresh runs inside one cron invocation, not a 100-wide batch run. */
const REFRESH_CONCURRENCY = 8;

/**
 * Everything a translation run needs to agree on: the locale's prompt, the
 * approved glossary it injects, the kind of each approved term (so the
 * prompt confines surface-specific kinds to their surface), the English
 * glosses that ride beside each injected term, and the digest the prompt
 * and the two maps produce. Loaded once per run so every batch in it is
 * stamped with the digest it was made under.
 */
export type TranslationContext = {
  locale: TranslationLocale;
  glossary: Glossary;
  /** `term -> kind` for the approved rows; see `kindInContext` in locales.mjs. */
  kinds: Readonly<Record<string, string>>;
  /** `term -> gloss`, locale-independent; injected beside the rendering of any term a batch mentions. */
  glosses: Readonly<Record<string, string>>;
  promptVersion: string;
};

/** Digest of everything that shapes an answer besides the segment itself: model, system prompt, approved glossary, glosses. */
export function promptVersionFor(locale: TranslationLocale, glossary: Glossary, glosses: Readonly<Record<string, string>>): string {
  return createHash("sha256")
    .update(TRANSLATION_MODEL)
    .update("\u0000")
    .update(locale.systemPrompt)
    .update("\u0000")
    .update(glossaryDigestInput(glossary))
    .update("\u0000")
    .update(glossDigestInput(glosses))
    .digest("hex")
    .slice(0, 16);
}

/** Build a prompt context from glossary data a request already fetched. */
export function translationContextFromRows(
  localeCode: string,
  rows: readonly Pick<TranslationGlossaryRow, "term" | "target" | "kind" | "status">[],
  glosses: Readonly<Record<string, string>>,
): TranslationContext {
  const locale = resolveLocale(localeCode);
  const approved = rows.filter((row) => row.status === "approved");
  const glossary: Glossary = Object.fromEntries(approved.map((row) => [row.term, row.target]));
  const kinds = Object.fromEntries(approved.map((row) => [row.term, row.kind]));
  return { locale, glossary, kinds, glosses, promptVersion: promptVersionFor(locale, glossary, glosses) };
}

export async function loadTranslationContext(localeCode: string): Promise<TranslationContext> {
  const [rows, glosses] = await Promise.all([
    readGlossaryRows(localeCode, { status: "approved" }),
    loadGlosses(),
  ]);
  return translationContextFromRows(localeCode, rows, glosses);
}

export function segmentsOf(record: { slug: string }, kind: TranslationRecordKind = "article"): Segment[] {
  return extractSegments({ items: [record as unknown as Record<string, unknown>] }, LIVE_CORPORA[kind]).segments;
}

/** The deduped work units of one record, each stamped with the corpus it came from so the prompt can scope glossary kinds. */
export function workUnitsOf(segments: readonly Segment[], kind: TranslationRecordKind): WorkUnit[] {
  return buildWorkUnits(segments).map((unit) => ({ ...unit, contextKind: kind }));
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

/**
 * Splice flat-store translations into an arbitrary corpus-shaped dataset.
 * This is for reader datasets such as warning banners that are not translation
 * job record kinds; untranslated leaves remain canonical English.
 */
export async function localizeDataset<T extends Record<string, unknown>>(
  dataset: { items: readonly T[] },
  corpus: typeof LIVE_SUBSTANCE_CORPUS,
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

/**
 * Translate the work units the store lacks and persist the ones that pass
 * every blocking check. A rejected unit is recorded, not stored: its English
 * keeps rendering, the rejection row explains why, and the next refresh
 * tries it again.
 */
export async function translateUnits(
  units: readonly WorkUnit[],
  context: TranslationContext,
  apiKey: string,
  signal?: AbortSignal,
): Promise<Pick<RefreshOutcome, "stored" | "rejected" | "usage">> {
  const { locale, glossary, kinds, glosses, promptVersion } = context;
  const localeCode = locale.code;
  const usage = { prompt: 0, completion: 0, requests: 0 };
  const rows: TranslationSegmentRow[] = [];
  const rejected: RefreshOutcome["rejected"] = [];

  const batches = planBatches(units);
  let cursor = 0;
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(REFRESH_CONCURRENCY, batches.length) }, async () => {
      while (cursor < batches.length) {
        signal?.throwIfAborted();
        const batch = batches[cursor];
        cursor += 1;
        const verdicts = await translateBatchWithRetries({
          units: batch,
          locale,
          glossary,
          kinds,
          glosses,
          model: TRANSLATION_MODEL,
          apiKey,
          signal,
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
  await Promise.all([
    clearTranslationRejections(localeCode, rows.map((row) => row.hash)),
    writeTranslationRejections(rejected.map((entry) => ({
      locale: localeCode,
      hash: entry.hash,
      source: units.find((unit) => unit.hash === entry.hash)?.source ?? "",
      defects: entry.defects,
    }))),
  ]);
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  signal?.throwIfAborted();
  return { stored: rows.length, rejected, usage };
}

/** Bring one record's locale up to date with its current English and the current prompt digest. */
export async function refreshRecordTranslations(
  record: { slug: string },
  context: TranslationContext,
  kind: TranslationRecordKind,
  apiKey: string,
  signal?: AbortSignal,
): Promise<RefreshOutcome> {
  signal?.throwIfAborted();
  const localeCode = context.locale.code;
  const segments = segmentsOf(record, kind);
  const units = workUnitsOf(segments, kind);
  // Missing hashes and hashes stamped with another digest both go back to the
  // model: a scoped stale replay marks the segments a glossary edit touched
  // and enqueues their records, and this is where the cron picks them up.
  const pending = new Set(await pendingTranslationHashes(localeCode, units.map((unit) => unit.hash), context.promptVersion));
  const due = units.filter((unit) => pending.has(unit.hash));
  const result = due.length > 0
    ? await translateUnits(due, context, apiKey, signal)
    : { stored: 0, rejected: [], usage: { prompt: 0, completion: 0, requests: 0 } };
  return { slug: record.slug, locale: localeCode, segments: segments.length, requested: due.length, ...result };
}
