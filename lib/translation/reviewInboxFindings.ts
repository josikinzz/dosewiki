/**
 * Review Inbox findings: what the automated checks found in stored
 * translations, and what readers suggested from the public glossary.
 *
 * - Rejected segments: the validator refused every attempt and nothing is
 *   stored, so readers see English.
 * - Glossary disagreements: the English mentions an approved term (the shared
 *   term matcher, scoped by the term's kind) and the translation lacks its
 *   rendering.
 * - Leftover English: `findLeftoverLatin` over zh-Hans translations.
 *
 * Both checks read what readers see: where a human article correction applies
 * (overlay decision apply or apply-recheck), its wording replaces the stored
 * machine target, and terms the reviewer marked "Fine here" when saving it are
 * not listed.
 * - Reader suggestions: new or in-review rows of the public glossary feedback
 *   queue, read by the caller through the existing feedback query.
 *
 * The scan reuses the coverage inventory and its bounded, batched reads, and is
 * cached for at most five minutes per locale and approved glossary. "Fine here"
 * exceptions are read fresh on every request, so a marked item leaves at once.
 */
import "server-only";
import { createHash } from "node:crypto";
import { getPostgresClient } from "@server/postgres/runtime/backend";
import type { PublicDataReadAdapter } from "../data/publicData.reads";
import { assertDataWritesNotFrozen } from "../runtime/dataWriteFreeze";
import { kindInContext, resolveLocale } from "../../scripts/translation/locales.mjs";
import { mentionsTerm, termFinder } from "../../scripts/translation/term-match.mjs";
import { findLeftoverLatin } from "../../scripts/translation/validate.mjs";
import { segmentHash } from "../../scripts/translation/segment-manifest.mjs";
import { readGlossaryRows, type TranslationGlossaryRow } from "./glossary";
import { readTranslationRecord, segmentsOf, type TranslationRecordKind } from "./liveTranslation";
import { narrativeIdentity, narrativeOverlayDecision } from "./narrativeIdentity";
import { decodeReviewReason } from "./reviewReason";
import { narrativeOverlayApplies, type ReviewSnapshot, type ReviewState } from "./reviewTypes";
import { mutateReviewEntries, readReviewEntries, TranslationReviewConflictError, TranslationReviewError } from "./reviewStore";
import {
  glossaryTermHref,
  narrativeSegmentHref,
  qaExceptionKey,
  type InboxException,
  type InboxItem,
  type InboxReason,
  type QaFindingKind,
} from "./reviewInboxTypes";
import { readTranslationCoverageRows, readTranslationRejections } from "./segmentStore";
import { coveragePagePath, getCoverageInventory, type CoverageInventory } from "./translationCoverage";

const FINDINGS_TTL_MS = 5 * 60_000;
const READ_BATCH = 1000;
/** Pages kept per finding for its location; the rest are counted. */
const RECORDS_PER_FINDING = 5;

type FindingRecord = { kind: TranslationRecordKind; slug: string };
export type QaFinding = {
  reason: Extract<InboxReason, "segment-rejected" | "glossary-disagreement" | "leftover-latin">;
  hash: string;
  source: string;
  /** The translation readers see (a human correction where one applies); null for a rejected segment. */
  target: string | null;
  /** Glossary term, or the leftover English words joined by spaces. */
  term?: string;
  rendering?: string;
  /** Glossary revision of the rendering and the stored target digest, the stored target digest, or the last rejection time. */
  revision: string;
  defects?: string[];
  attempts?: number;
  records: FindingRecord[];
  pages: number;
};

/**
 * The glossary revision of an approved rendering: when that rendering last
 * changed (`reviewed_at`, which a Confirm leaves alone), else the row's update
 * time. A saved draft does not change it; approving new wording does.
 */
export function glossaryRenderingRevision(row: Pick<TranslationGlossaryRow, "reviewed_at" | "updated_at">): string {
  return String(row.reviewed_at ?? row.updated_at);
}
/** The stored translation a "Fine here" exception is about. */
export function storedTargetRevision(target: string): string {
  return createHash("sha256").update(target, "utf8").digest("hex").slice(0, 16);
}
/** A glossary disagreement's revision: the rendering's glossary revision and the stored translation, so a change to either returns the finding. */
export function glossaryFindingRevision(glossaryRevision: string, target: string): string {
  return `${glossaryRevision}:${storedTargetRevision(target)}`;
}
/** Whether a stored target carries the rendering; Latin renderings match case-insensitively. */
function carriesRendering(target: string, rendering: string): boolean {
  return target.includes(rendering) || target.toLowerCase().includes(rendering.toLowerCase());
}

type ScanGlossaryTerm = { term: string; target: string; kind: string; revision: string };
/** One wording readers see for a sentence, with the glossary terms its reviewer kept out on purpose. */
type ShownTarget = { target: string; glossaryExceptions: readonly string[] };
/**
 * A sentence of one article where a human correction applies at one or more of
 * its places. `machineShown` is true when some place still shows the stored
 * machine target.
 */
export type ArticleCorrection = { targets: ShownTarget[]; machineShown: boolean };

/** Pure scan over the inventory and what is stored for it. Exported for tests. */
export function scanInboxFindings(input: {
  inventory: CoverageInventory;
  stored: ReadonlyMap<string, string>;
  rejections: ReadonlyMap<string, { source: string; defects: string[]; attempts: number; last_tried_at: number }>;
  glossary: readonly ScanGlossaryTerm[];
  chinese: boolean;
  /** Applied human corrections by article slug, then segment hash. */
  corrections?: ReadonlyMap<string, ReadonlyMap<string, ArticleCorrection>>;
}): QaFinding[] {
  const { inventory, stored, rejections, glossary, chinese, corrections } = input;
  // Indexed by each term's opening letters, so a unit is matched only against
  // the terms it could mention; the shared matcher still decides every finding.
  const termsIn: (text: string) => ScanGlossaryTerm[] = termFinder(glossary, (entry: ScanGlossaryTerm) => entry.term);
  const glossaryMap = Object.fromEntries(glossary.map(({ term, target }) => [term, target]));
  // Substance article slugs are the names rule 2 keeps in Latin in lowercase prose.
  const latinNames = inventory.records.filter((record) => record.kind === "article").map((record) => record.slug);
  const findings = new Map<string, QaFinding>();
  const note = (key: string, record: FindingRecord, create: () => Omit<QaFinding, "records" | "pages">) => {
    const existing = findings.get(key);
    if (existing) {
      existing.pages += 1;
      if (existing.records.length < RECORDS_PER_FINDING) existing.records.push(record);
      return;
    }
    findings.set(key, { ...create(), records: [record], pages: 1 });
  };
  const mentioned = new Map<string, ScanGlossaryTerm[]>();
  const leftover = new Map<string, string[]>();
  for (const record of inventory.records) {
    const where = { kind: record.kind, slug: record.slug };
    const kinds = new Set([record.kind]);
    for (const unit of record.units) {
      const target = stored.get(unit.hash)?.trim() ? stored.get(unit.hash)! : null;
      const correction = record.kind === "article" ? corrections?.get(record.slug)?.get(unit.hash) : undefined;
      const machineShown = !correction || correction.machineShown;
      const rejection = rejections.get(unit.hash);
      if (rejection && !target && machineShown) {
        note(`rejected\u0000${unit.hash}`, where, () => ({
          reason: "segment-rejected", hash: unit.hash, source: unit.source, target: null,
          revision: String(rejection.last_tried_at), defects: rejection.defects, attempts: rejection.attempts,
        }));
      }
      const shown: (ShownTarget & { machine: boolean })[] = [
        ...(correction?.targets ?? []).map((human) => ({ ...human, machine: false })),
        ...(machineShown && target ? [{ target, glossaryExceptions: [], machine: true }] : []),
      ];
      for (const { target: text, glossaryExceptions, machine } of shown) {
        // Machine results are shared by every page with this hash; human wording is checked where it applies.
        let terms = machine ? mentioned.get(unit.hash) : undefined;
        if (!terms) {
          terms = termsIn(unit.source).filter(({ target: rendering }) => !carriesRendering(text, rendering));
          if (machine) mentioned.set(unit.hash, terms);
        }
        for (const term of terms) {
          if (!kindInContext(term.kind, kinds) || glossaryExceptions.includes(term.term)) continue;
          note(`glossary\u0000${unit.hash}\u0000${term.term}\u0000${text}`, where, () => ({
            reason: "glossary-disagreement", hash: unit.hash, source: unit.source, target: text,
            term: term.term, rendering: term.target, revision: glossaryFindingRevision(term.revision, text),
          }));
        }
        if (!chinese) continue;
        const words = (machine ? leftover.get(unit.hash) : undefined) ?? findLeftoverLatin({ source: unit.source, target: text, glossary: glossaryMap, latinNames });
        if (machine) leftover.set(unit.hash, words);
        if (words.length) {
          note(`latin\u0000${unit.hash}\u0000${text}`, where, () => ({
            reason: "leftover-latin", hash: unit.hash, source: unit.source, target: text,
            term: words.join(" "), revision: storedTargetRevision(text),
          }));
        }
      }
    }
  }
  return [...findings.values()];
}

type FindingsScan = { generatedAt: number; glossaryKey: string; findings: QaFinding[] };
const scanCache = new WeakMap<PublicDataReadAdapter, Map<string, { value?: FindingsScan; pending?: Promise<FindingsScan> }>>();

function approvedTerms(rows: readonly TranslationGlossaryRow[]): ScanGlossaryTerm[] {
  return rows
    .filter((row) => row.status === "approved")
    .map((row) => ({ term: row.term, target: row.target, kind: row.kind, revision: glossaryRenderingRevision(row) }))
    .sort((a, b) => a.term.localeCompare(b.term));
}

/** The approved narrative entries of a locale that are about substance articles, by slug. */
function articleApprovals(entries: Awaited<ReturnType<typeof readReviewEntries>>): Map<string, Map<string, ReviewSnapshot>> {
  const bySlug = new Map<string, Map<string, ReviewSnapshot>>();
  for (const entry of entries) {
    if (!entry.approved) continue;
    let context: unknown;
    try { context = JSON.parse(entry.approved.context); } catch { continue; }
    const { kind, slug } = (context && typeof context === "object" ? context : {}) as { kind?: unknown; slug?: unknown };
    if (kind !== "article" || typeof slug !== "string") continue;
    let approvals = bySlug.get(slug);
    if (!approvals) { approvals = new Map(); bySlug.set(slug, approvals); }
    approvals.set(entry.sourceId, entry.approved);
  }
  return bySlug;
}

/**
 * The glossary exceptions recorded with each approved wording: those of the
 * latest save whose draft is that wording. Bounded batches, as coverage reads.
 */
async function approvedWordingExceptions(locale: string, approved: ReadonlyMap<string, string>): Promise<Map<string, string[]>> {
  const ids = [...approved.keys()];
  const exceptions = new Map<string, string[]>();
  for (let start = 0; start < ids.length; start += READ_BATCH) {
    const rows = await getPostgresClient().sql<{ source_id: string; reason: string; after_state: ReviewState }>(
      `SELECT "source_id", "reason", "after_state" FROM "translationReviewHistory" WHERE "locale" = $1 AND "scope" = 'narrative' AND "action" = 'save' AND "source_id" = ANY($2::text[]) ORDER BY "revision" DESC`,
      [locale, ids.slice(start, start + READ_BATCH)],
    );
    for (const row of rows) {
      if (exceptions.has(row.source_id) || row.after_state?.draft?.target !== approved.get(row.source_id)) continue;
      exceptions.set(row.source_id, decodeReviewReason(row.reason).glossaryExceptions);
    }
  }
  return exceptions;
}

/** Applied human article corrections, by slug and segment hash, with the glossary exceptions saved with each. */
async function readArticleCorrections(reads: PublicDataReadAdapter, locale: string): Promise<Map<string, Map<string, ArticleCorrection>>> {
  const applied: { slug: string; hash: string; id: string; target: string }[] = [];
  const machineShown = new Set<string>();
  for (const [slug, approvals] of articleApprovals(await readReviewEntries(locale, "narrative"))) {
    const record = await readTranslationRecord(reads, "article", slug);
    if (!record) continue;
    const segments = segmentsOf({ ...record, slug }, "article");
    for (const segment of segments) {
      const id = narrativeIdentity("article", segment);
      const approved = approvals.get(id);
      if (approved && narrativeOverlayApplies(narrativeOverlayDecision("article", segments, segment, approved))) applied.push({ slug, hash: segment.hash, id, target: approved.target });
      else machineShown.add(`${slug}\u0000${segment.hash}`);
    }
  }
  const exceptions = await approvedWordingExceptions(locale, new Map(applied.map(({ id, target }) => [id, target])));
  const corrections = new Map<string, Map<string, ArticleCorrection>>();
  for (const { slug, hash, id, target } of applied) {
    let bySlug = corrections.get(slug);
    if (!bySlug) { bySlug = new Map(); corrections.set(slug, bySlug); }
    let correction = bySlug.get(hash);
    if (!correction) { correction = { targets: [], machineShown: machineShown.has(`${slug}\u0000${hash}`) }; bySlug.set(hash, correction); }
    correction.targets.push({ target, glossaryExceptions: exceptions.get(id) ?? [] });
  }
  return corrections;
}

async function buildFindingsScan(reads: PublicDataReadAdapter, locale: string, glossary: ScanGlossaryTerm[], glossaryKey: string): Promise<FindingsScan> {
  const inventory = await getCoverageInventory(reads);
  const hashes = [...new Set(inventory.records.flatMap((record) => record.units.map((unit) => unit.hash)))];
  const stored = new Map<string, string>();
  const rejections = new Map<string, { source: string; defects: string[]; attempts: number; last_tried_at: number }>();
  // Keep database argument arrays bounded, as coverage does.
  for (let start = 0; start < hashes.length; start += READ_BATCH) {
    const batch = hashes.slice(start, start + READ_BATCH);
    const [rows, rejected] = await Promise.all([readTranslationCoverageRows(locale, batch), readTranslationRejections(locale, batch)]);
    for (const row of rows) stored.set(row.hash, row.target);
    for (const [hash, row] of rejected) rejections.set(hash, row);
  }
  const chinese = resolveLocale(locale).scriptGate === "simplified";
  const corrections = await readArticleCorrections(reads, locale);
  return { generatedAt: Date.now(), glossaryKey, findings: scanInboxFindings({ inventory, stored, rejections, glossary, chinese, corrections }) };
}

/** Findings for one locale: at most five minutes old, and never older than the approved glossary. */
export async function getInboxFindings(reads: PublicDataReadAdapter, locale: string): Promise<QaFinding[]> {
  const glossary = approvedTerms(await readGlossaryRows(locale, { status: "approved" }));
  const glossaryKey = createHash("sha256").update(JSON.stringify(glossary)).digest("hex");
  let byLocale = scanCache.get(reads);
  if (!byLocale) { byLocale = new Map(); scanCache.set(reads, byLocale); }
  let entry = byLocale.get(locale);
  if (!entry) { entry = {}; byLocale.set(locale, entry); }
  const cached = entry.value;
  if (cached && cached.glossaryKey === glossaryKey && Date.now() - cached.generatedAt < FINDINGS_TTL_MS) return cached.findings;
  if (!entry.pending) {
    const current = entry;
    current.pending = buildFindingsScan(reads, locale, glossary, glossaryKey)
      .then((value) => { current.value = value; return value; })
      .finally(() => { current.pending = undefined; });
  }
  const scan = await entry.pending!;
  // A scan started under an older glossary is not reused for a newer one.
  return scan.glossaryKey === glossaryKey ? scan.findings : (await buildFindingsScan(reads, locale, glossary, glossaryKey)).findings;
}

/** Exceptions a reviewer recorded with "Fine here", as review-table keys. */
export async function readQaExceptionKeys(locale: string): Promise<Set<string>> {
  return new Set((await readReviewEntries(locale, "qa-exception")).filter((entry) => entry.approved).map((entry) => entry.sourceId));
}

const KIND_LABEL: Record<TranslationRecordKind, string> = {
  article: "article", effect: "effect", report: "report", library: "library", replication: "replication", profile: "profile",
};
/** Items that point at an article sentence resolve their narrative identity only when shown. */
const articleOrigins = new WeakMap<InboxItem, { slug: string; hash: string }>();

function findingItem(locale: string, finding: QaFinding): InboxItem {
  const record = finding.records.find((candidate) => candidate.kind === "article") ?? finding.records[0];
  const more = finding.pages > 1 ? ` (and ${finding.pages - 1} more ${finding.pages === 2 ? "page" : "pages"})` : "";
  const where = `${KIND_LABEL[record.kind]} · ${record.slug}${more}`;
  const page = coveragePagePath(record.kind, record.slug);
  const exception = (kind: QaFindingKind): InboxException => ({ finding: kind, hash: finding.hash, term: finding.term!, revision: finding.revision });
  let item: InboxItem;
  switch (finding.reason) {
    case "segment-rejected": {
      const attempts = finding.attempts ?? 1;
      item = {
        scope: "segment", id: finding.hash, reason: finding.reason, english: finding.source, live: null,
        detail: `Rejected after ${attempts} ${attempts === 1 ? "try" : "tries"}: ${finding.defects?.join(", ") || "no defect recorded"}`,
        where, revision: finding.revision, href: page, accept: null,
      };
      break;
    }
    case "glossary-disagreement":
      item = {
        scope: "segment", id: `${finding.hash}:${finding.term}`, reason: finding.reason, english: finding.source, live: finding.target,
        detail: `Glossary: ${finding.term} → ${finding.rendering}`,
        where, revision: finding.revision, href: glossaryTermHref(locale, finding.term!), accept: null,
        exception: exception("glossary-disagreement"),
      };
      break;
    case "leftover-latin":
      item = {
        scope: "segment", id: `${finding.hash}:latin`, reason: finding.reason, english: finding.source, live: finding.target,
        detail: `English left in: ${finding.term!.split(" ").join(", ")}`,
        where, revision: finding.revision, href: page, accept: null,
        exception: exception("leftover-latin"),
      };
      break;
  }
  if (record.kind === "article") articleOrigins.set(item, { slug: record.slug, hash: finding.hash });
  return item;
}

/** QA findings as inbox items, without those a reviewer marked "Fine here". */
export function qaFindingItems(locale: string, findings: readonly QaFinding[], exceptions: ReadonlySet<string>): InboxItem[] {
  return findings
    .map((finding) => findingItem(locale, finding))
    .filter((item) => !item.exception || !exceptions.has(qaExceptionKey(item.exception)));
}

/**
 * Points article findings on one page at the sentence's editor field: the
 * Narratives view at that sentence. Reads at most one record per article shown.
 */
export async function resolveFindingLinks(reads: PublicDataReadAdapter, locale: string, items: readonly InboxItem[]): Promise<void> {
  const bySlug = new Map<string, Promise<ReturnType<typeof segmentsOf> | null>>();
  for (const item of items) {
    const origin = articleOrigins.get(item);
    if (!origin) continue;
    let segments = bySlug.get(origin.slug);
    if (!segments) {
      segments = readTranslationRecord(reads, "article", origin.slug).then((record) => (record ? segmentsOf({ ...record, slug: origin.slug }, "article") : null));
      bySlug.set(origin.slug, segments);
    }
    const segment = (await segments)?.find((candidate) => candidate.hash === origin.hash);
    if (!segment) continue;
    item.href = narrativeSegmentHref(locale, origin.slug, narrativeIdentity("article", segment));
    item.where = `${item.where} · ${segment.path}`;
  }
}

/** A row of the public glossary feedback queue, as the existing feedback list query returns it. */
export type ReaderSuggestionRow = {
  id: string;
  locale: string;
  term: string;
  target: string;
  details: string;
  alternative: string;
  status: string;
  created_at: string;
};
/** Suggestions still waiting for a translator: new, or opened for review but not decided. */
export function readerSuggestionItems(locale: string, rows: readonly ReaderSuggestionRow[]): InboxItem[] {
  return rows
    .filter((row) => row.locale === locale && (row.status === "new" || row.status === "reviewing"))
    .map((row) => ({
      scope: "feedback",
      id: row.id,
      reason: "reader-suggestion",
      english: row.term,
      // Empty when the reader translated a term this language did not have yet.
      live: row.target || null,
      ...(row.alternative.trim() ? { suggestion: row.alternative.trim() } : {}),
      ...(row.details.trim() ? { detail: `Reader: ${row.details.trim()}` } : {}),
      where: `Public glossary · ${row.created_at.slice(0, 10)}`,
      revision: row.status,
      href: glossaryTermHref(locale, row.term),
      accept: { kind: "feedback-resolve", id: row.id },
    }));
}

/**
 * "Fine here": records a qa-exception in the review tables, keyed by locale,
 * segment hash, term, and revision (which covers the stored translation), at the revision the reviewer saw. Refuses
 * (409) when the stored translation or the rendering changed since, or the
 * finding no longer holds. Recording the same exception twice is a no-op.
 */
export async function recordQaException(locale: string, exception: InboxException, actor: string): Promise<void> {
  assertDataWritesNotFrozen("recordQaException");
  const [machine] = await getPostgresClient().sql<{ source: string; target: string }>(
    'SELECT "source", "target" FROM "translationSegments" WHERE "locale" = $1 AND "hash" = $2',
    [locale, exception.hash],
  );
  // The finding may be about the stored machine target or an approved human correction of the same English.
  const shown = [
    ...(machine?.target.trim() ? [machine] : []),
    ...(await readReviewEntries(locale, "narrative")).flatMap((entry) => (entry.approved?.target.trim() && segmentHash(entry.approved.source) === exception.hash ? [entry.approved] : [])),
  ];
  if (!shown.length) throw new TranslationReviewError("This translation is no longer stored. Reload the inbox.", 409, "QA_FINDING_GONE");
  const digest = exception.finding === "glossary-disagreement" ? exception.revision.slice(exception.revision.lastIndexOf(":") + 1) : exception.revision;
  const row = shown.find((candidate) => storedTargetRevision(candidate.target) === digest);
  if (!row) throw new TranslationReviewConflictError();
  let context: Record<string, string>;
  if (exception.finding === "glossary-disagreement") {
    const term = (await readGlossaryRows(locale, { status: "approved" })).find((candidate) => candidate.term === exception.term);
    if (!term || glossaryFindingRevision(glossaryRenderingRevision(term), row.target) !== exception.revision) throw new TranslationReviewConflictError();
    if (!mentionsTerm(row.source, term.term) || carriesRendering(row.target, term.target))
      throw new TranslationReviewError("This translation no longer disagrees with the glossary. Reload the inbox.", 409, "QA_FINDING_GONE");
    context = { finding: exception.finding, hash: exception.hash, term: term.term, rendering: term.target, glossaryRevision: glossaryRenderingRevision(term), targetRevision: digest };
  } else {
    context = { finding: exception.finding, hash: exception.hash, words: exception.term, targetRevision: exception.revision };
  }
  const base = {
    locale, scope: "qa-exception" as const, sourceId: qaExceptionKey(exception), source: row.source,
    context: JSON.stringify(context), actor, reason: "Fine here",
  };
  try {
    await mutateReviewEntries([
      { ...base, action: "save", expectedRevision: 0, target: row.target },
      { ...base, action: "approve", expectedRevision: 1 },
    ]);
  } catch (error) {
    if (error instanceof TranslationReviewConflictError && (await readQaExceptionKeys(locale)).has(base.sourceId)) return;
    throw error;
  }
}
