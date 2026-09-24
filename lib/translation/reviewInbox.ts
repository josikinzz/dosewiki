/**
 * Review Inbox read model: everything in one locale that needs a person, read
 * from the existing review tables and stored segments. It writes nothing and
 * adds no approval path; each item's Accept names an existing mutation.
 */
import "server-only";
import type { PublicDataReadAdapter } from "../data/publicData.reads";
import { resolveLocale } from "../../scripts/translation/locales.mjs";
import { readGlossaryReviewRows } from "./glossaryReview";
import { readTranslationRecord, segmentsOf } from "./liveTranslation";
import { narrativeIdentity, narrativeOverlayDecision, narrativeSourceVersion } from "./narrativeIdentity";
import { readReviewEntries } from "./reviewStore";
import { readTranslationCoverageRows } from "./segmentStore";
import { readUiTranslations } from "./uiTranslationStore";
import {
  glossaryTermHref,
  INBOX_PAGE_SIZE,
  narrativeSegmentHref,
  uiLabelHref,
  type InboxItem,
  type InboxReason,
} from "./reviewInboxTypes";
import type { ReviewEntry } from "./reviewTypes";

/** Reasons this slice checks, in list order: wording readers see wrong first, then re-checks, then unchecked terms. */
export const INBOX_CHECKS: readonly InboxReason[] = [
  "narrative-source-changed",
  "ui-source-changed",
  "narrative-recheck",
  "glossary-never-checked",
];

async function glossaryItems(locale: string): Promise<InboxItem[]> {
  // A projected draft already waits in the Glossary view; only untouched live rows are listed.
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
  return (await readUiTranslations(locale))
    .filter((row) => row.approved && row.status !== "draft" && (row.approved.source !== row.source || row.approved.context !== row.context))
    .map((row) => ({
      scope: "ui",
      id: row.id,
      reason: "ui-source-changed",
      english: row.source,
      // The stale approval no longer reaches a build; the compiled catalog is what readers get.
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
  // The narrative surface accepts substance articles only, so only their approvals are listed.
  const bySlug = new Map<string, ReviewEntry[]>();
  for (const entry of await readReviewEntries(locale, "narrative")) {
    const record = recordOf(entry);
    if (!entry.approved || record?.kind !== "article" || typeof record.slug !== "string") continue;
    bySlug.set(record.slug, [...(bySlug.get(record.slug) ?? []), entry]);
  }
  const items: InboxItem[] = [];
  for (const [slug, entries] of bySlug) {
    const record = await readTranslationRecord(reads, "article", slug);
    // A withdrawn article or removed field has nothing a reviewer can act on here.
    if (!record) continue;
    const segments = segmentsOf({ ...record, slug }, "article");
    const sourceVersion = narrativeSourceVersion(segments);
    const byId = new Map(segments.map((segment) => [narrativeIdentity("article", segment), segment]));
    const listed = entries.flatMap((entry) => {
      const segment = byId.get(entry.sourceId);
      if (!segment) return [];
      const decision = narrativeOverlayDecision("article", segments, segment, entry.approved!);
      if (decision === "apply") return [];
      // A current draft is a correction in progress, not an approval waiting for a person.
      if (entry.draft && narrativeOverlayDecision("article", segments, segment, entry.draft) !== "stale") return [];
      return [{ entry, segment, decision }];
    });
    const machine = new Map((await readTranslationCoverageRows(locale, listed.map(({ segment }) => segment.hash))).map((row) => [row.hash, row.target]));
    for (const { entry, segment, decision } of listed) {
      const approved = entry.approved!;
      const recheck = decision === "apply-recheck";
      // A re-check approval is still on the page; a stale one falls back to machine wording.
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

/** One page of the locale's inbox, and the total across every page. */
export async function readReviewInbox(
  reads: PublicDataReadAdapter,
  locale: string,
  offset = 0,
): Promise<{ items: InboxItem[]; total: number; checked: InboxReason[] }> {
  resolveLocale(locale);
  const scopes = await Promise.all([glossaryItems(locale), uiItems(locale), narrativeItems(reads, locale)]);
  const order = (item: InboxItem) => INBOX_CHECKS.indexOf(item.reason);
  const all = scopes.flat().sort((a, b) => order(a) - order(b) || a.where.localeCompare(b.where) || a.id.localeCompare(b.id));
  return { items: all.slice(offset, offset + INBOX_PAGE_SIZE), total: all.length, checked: [...INBOX_CHECKS] };
}
