import "server-only";
import type { PublicDataReadAdapter } from "../data/publicData.reads";
import { resolveLocale } from "../../scripts/translation/locales.mjs";
import { readGlossaryReviewRows } from "./glossaryReview";
import { readTranslationRecord, segmentsOf } from "./liveTranslation";
import { narrativeIdentity, narrativeOverlayDecision, narrativeSourceVersion } from "./narrativeIdentity";
import { readReviewEntries } from "./reviewStore";
import { modelSuggestionItems } from "./fluencyReview";
import { readTranslationCoverageRows } from "./segmentStore";
import { readUiTranslations } from "./uiTranslationStore";
import { presentTranslatorNoteSections, translatorNoteLocation, translatorNoteSectionLabel } from "./translatorNotes";
import {
  glossaryTermHref,
  INBOX_PAGE_SIZE,
  narrativeSegmentHref,
  translatorNoteHref,
  uiLabelHref,
  type InboxItem,
  type InboxReason,
} from "./reviewInboxTypes";
import type { ReviewEntry } from "./reviewTypes";
import {
  getInboxFindings,
  qaFindingItems,
  readerSuggestionItems,
  readQaExceptionKeys,
  resolveFindingLinks,
  type ReaderSuggestionRow,
} from "./reviewInboxFindings";

const INBOX_ORDER: Record<InboxReason, number> = {
  "reader-suggestion": 0,
  "segment-rejected": 1,
  "narrative-source-changed": 2,
  "ui-source-changed": 3,
  "narrative-recheck": 4,
  "glossary-disagreement": 5,
  "leftover-latin": 6,
  "note-orphaned": 7,
  "model-suggestion": 8,
  "glossary-never-checked": 9,
};
export const INBOX_CHECKS: readonly InboxReason[] = (Object.keys(INBOX_ORDER) as InboxReason[]).sort((a, b) => INBOX_ORDER[a] - INBOX_ORDER[b]);

async function glossaryItems(locale: string): Promise<InboxItem[]> {
  return (await readGlossaryReviewRows(locale))
    .filter((row) => row.status === "approved" && row.review_provenance === "legacy_unverified")
    .map((row) => ({
      scope: "glossary",
      id: row.term,
      reason: "glossary-never-checked",
      english: row.term,
      live: row.target,
      where: row.kind,
      revision: row.revision,
      href: glossaryTermHref(locale, row.term),
      accept: { kind: "glossary-confirm", term: row.term, expectedRevision: row.revision },
    }));
}

async function uiItems(locale: string): Promise<InboxItem[]> {
  return (await readUiTranslations(locale, { approvedOnly: true }))
    .filter((row) => row.approved && row.status !== "draft" && (row.approved.source !== row.source || row.approved.context !== row.context))
    .map((row) => ({
      scope: "ui",
      id: row.id,
      reason: "ui-source-changed",
      english: row.source,
      live: row.compiledTarget,
      previous: { english: row.approved!.source, target: row.approved!.target },
      where: row.context,
      revision: String(row.revision),
      href: uiLabelHref(locale, row.id),
      accept: row.compiledTarget ? { kind: "ui-approve", id: row.id, expectedRevision: row.revision, target: row.compiledTarget } : null,
    }));
}

function recordOf(entry: ReviewEntry): { kind: unknown; slug: unknown } | null {
  try {
    const context: unknown = JSON.parse(entry.approved?.context ?? "");
    return context && typeof context === "object" ? (context as { kind: unknown; slug: unknown }) : null;
  } catch {
    return null;
  }
}

async function narrativeItems(reads: PublicDataReadAdapter, locale: string): Promise<InboxItem[]> {
  const bySlug = new Map<string, ReviewEntry[]>();
  for (const entry of await readReviewEntries(locale, "narrative")) {
    const record = recordOf(entry);
    if (!entry.approved || record?.kind !== "article" || typeof record.slug !== "string") continue;
    bySlug.set(record.slug, [...(bySlug.get(record.slug) ?? []), entry]);
  }
  const items: InboxItem[] = [];
  for (const [slug, entries] of bySlug) {
    const record = await readTranslationRecord(reads, "article", slug);
    if (!record) continue;
    const segments = segmentsOf({ ...record, slug }, "article");
    const sourceVersion = narrativeSourceVersion(segments);
    const byId = new Map(segments.map((segment) => [narrativeIdentity("article", segment), segment]));
    const listed = entries.flatMap((entry) => {
      const segment = byId.get(entry.sourceId);
      if (!segment) return [];
      const decision = narrativeOverlayDecision("article", segments, segment, entry.approved!);
      if (decision === "apply") return [];
      if (entry.draft && narrativeOverlayDecision("article", segments, segment, entry.draft) !== "stale") return [];
      return [{ entry, segment, decision }];
    });
    const machine = new Map((await readTranslationCoverageRows(locale, listed.map(({ segment }) => segment.hash))).map((row) => [row.hash, row.target]));
    for (const { entry, segment, decision } of listed) {
      const approved = entry.approved!;
      const recheck = decision === "apply-recheck";
      const live = recheck ? approved.target : (machine.get(segment.hash) ?? null);
      items.push({
        scope: "narrative",
        id: entry.sourceId,
        reason: recheck ? "narrative-recheck" : "narrative-source-changed",
        english: segment.source,
        live,
        ...(approved.source === segment.source ? {} : { previous: { english: approved.source, target: approved.target } }),
        where: `${slug} · ${segment.path}`,
        revision: String(entry.revision),
        href: narrativeSegmentHref(locale, slug, entry.sourceId),
        accept: live ? { kind: "narrative-approve", slug, id: entry.sourceId, sourceVersion, expectedRevision: entry.revision, target: live } : null,
      });
    }
  }
  return items;
}

async function noteItems(reads: PublicDataReadAdapter, locale: string): Promise<InboxItem[]> {
  const items: InboxItem[] = [];
  const present = new Map<string, Set<string> | null>();
  for (const entry of await readReviewEntries(locale, "note")) {
    const location = translatorNoteLocation(entry), body = entry.approved?.target ?? entry.draft?.target;
    if (!location || !body) continue;
    if (!present.has(location.slug)) {
      const record = await readTranslationRecord(reads, "article", location.slug);
      present.set(location.slug, record ? presentTranslatorNoteSections(record) : null);
    }
    const sections = present.get(location.slug);
    if (!sections || sections.has(location.section)) continue;
    const label = translatorNoteSectionLabel(location.section);
    items.push({
      scope: "note", id: entry.sourceId, reason: "note-orphaned", english: label, live: null,
      previous: { english: label, target: body }, where: `${location.slug} · ${label}`, revision: String(entry.revision),
      href: translatorNoteHref(locale, location.slug, location.section), accept: null,
    });
  }
  return items;
}

async function findingItems(reads: PublicDataReadAdapter, locale: string): Promise<InboxItem[]> {
  const [findings, exceptions] = await Promise.all([getInboxFindings(reads, locale), readQaExceptionKeys(locale)]);
  return qaFindingItems(locale, findings, exceptions);
}

export type ReviewInboxOptions = {
  suggestions?: readonly ReaderSuggestionRow[] | null;
  reason?: InboxReason | null;
};

export async function readReviewInbox(
  reads: PublicDataReadAdapter,
  locale: string,
  offset = 0,
  options: ReviewInboxOptions = {},
): Promise<{ items: InboxItem[]; total: number; checked: InboxReason[]; counts: Partial<Record<InboxReason, number>>; reason: InboxReason | null }> {
  const chinese = resolveLocale(locale).scriptGate === "simplified";
  const suggestions = options.suggestions ?? null;
  const scopes = await Promise.all([glossaryItems(locale), uiItems(locale), narrativeItems(reads, locale), findingItems(reads, locale), noteItems(reads, locale), modelSuggestionItems(reads, locale)]);
  const order = (item: InboxItem) => INBOX_ORDER[item.reason];
  const every = [...scopes.flat(), ...(suggestions ? readerSuggestionItems(locale, suggestions) : [])];
  const counts: Partial<Record<InboxReason, number>> = {};
  for (const item of every) counts[item.reason] = (counts[item.reason] ?? 0) + 1;
  const reason = options.reason ?? null;
  const all = every
    .filter((item) => !reason || item.reason === reason)
    .sort((a, b) => order(a) - order(b) || a.where.localeCompare(b.where) || a.id.localeCompare(b.id));
  const items = all.slice(offset, offset + INBOX_PAGE_SIZE);
  await resolveFindingLinks(reads, locale, items);
  const checked = INBOX_CHECKS.filter((check) => (check !== "leftover-latin" || chinese) && (check !== "reader-suggestion" || suggestions));
  return { items, total: all.length, checked, counts, reason };
}
