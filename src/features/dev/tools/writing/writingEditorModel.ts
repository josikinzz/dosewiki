import { slugify } from "@/utils/slug";
import { isValidPublicationDate } from "@/utils/archiveDate";
import type { VCodeContent } from "@/features/effects/vcode/types";
import type { NarrativeHistoryEntry } from "@/features/effects/editing/NarrativeHistory";

export type WritingKind = "article" | "blog";
type WritingStatus = "draft" | "published";

/** One row of `effectIndexArticles.listForEditor`. */
export interface WritingListEntry {
  slug: string;
  title: string;
  kind: WritingKind;
  status: WritingStatus;
  publicationDate?: string;
  creationTime: number;
  teaser?: string;
  tags?: string[];
}

/** The whole row, as `effectIndexArticles.getForEditor` returns it. */
export interface WritingArticleRow {
  slug: string;
  title: string;
  tags?: string[];
  kind?: WritingKind;
  status?: WritingStatus;
  bodyFormat?: "vcode" | "markdown";
  body_ast?: VCodeContent;
  baseRevision: string;
  citations?: Array<{ url: string; text: string }>;
  shortDescription?: string;
  history?: NarrativeHistoryEntry[];
  body_raw?: string;
  teaser?: string;
  coverImageUrl?: string;
  authorProfileKeys?: string[];
  publicationDate?: string;
}

export interface WritingDraft {
  slug: string;
  title: string;
  teaser: string;
  coverImageUrl: string;
  body: string;
  bodyFormat: "vcode" | "markdown";
  tags: string[];
  authorProfileKeys: string[];
  status: WritingStatus;
  publicationDate: string;
}

/** Today as `YYYY-MM-DD`, the shape the public date formatter reads. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function emptyWritingDraft(): WritingDraft {
  return {
    slug: "",
    title: "",
    teaser: "",
    coverImageUrl: "",
    body: "",
    bodyFormat: "markdown",
    tags: [],
    authorProfileKeys: [],
    status: "draft",
    publicationDate: todayIso(),
  };
}

export function draftFromRow(row: WritingArticleRow): WritingDraft {
  return {
    slug: row.slug,
    title: row.title,
    teaser: row.teaser ?? row.shortDescription ?? "",
    coverImageUrl: row.coverImageUrl ?? "",
    body: row.body_raw ?? "",
    bodyFormat: row.bodyFormat ?? "vcode",
    tags: [...(row.tags ?? [])],
    authorProfileKeys: [...(row.authorProfileKeys ?? [])],
    status: row.status ?? "published",
    publicationDate: row.publicationDate ?? "",
  };
}

/** Whether two drafts would post the same row; the dirty check behind the discard guard. */
export function isSameDraft(a: WritingDraft, b: WritingDraft): boolean {
  return (
    a.slug === b.slug &&
    a.title === b.title &&
    a.teaser === b.teaser &&
    a.coverImageUrl === b.coverImageUrl &&
    a.body === b.body &&
    a.bodyFormat === b.bodyFormat &&
    a.tags.length === b.tags.length &&
    a.tags.every((tag, index) => tag === b.tags[index]) &&
    a.status === b.status &&
    a.publicationDate === b.publicationDate &&
    a.authorProfileKeys.length === b.authorProfileKeys.length &&
    a.authorProfileKeys.every((key, index) => key === b.authorProfileKeys[index])
  );
}

/**
 * Why a publication date cannot be saved, or `null` when it can. Empty is
 * allowed: the page then shows no date.
 */
export function publicationDateError(value: string): string | null {
  const date = value.trim();
  if (!date || isValidPublicationDate(date)) return null;
  return `“${date}” is not a real date. Pick a day, or clear the field.`;
}

/**
 * Why a cover image address cannot be saved, or `null` when it can. The
 * Writing upsert accepts an http(s) address or a site path, nothing else.
 */
export function coverImageUrlError(value: string): string | null {
  const url = value.trim();
  if (!url || /^(https?:\/\/|\/(?!\/))/.test(url)) return null;
  return "Use a full https:// address or a site path starting with /.";
}

/** The existing tags across every entry, most used first, for the tag picker. */
export function writingTagOptions(entries: readonly WritingListEntry[]): Array<{ value: string; label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .sort(([a, left], [b, right]) => right - left || a.localeCompare(b))
    .map(([tag, count]) => ({ value: tag, label: tag, count }));
}


export type SlugAvailability =
  | { state: "empty" }
  | { state: "invalid"; message: string }
  | { state: "taken"; message: string }
  | { state: "free" }
  | { state: "current" };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Whether a slug can be saved to, checked against the editor listing rather than
 * against a dedicated query: the listing already carries every slug in the table,
 * both kinds, drafts included, so a separate round trip would only tell the
 * editor what the tab already knows.
 */
export function checkSlugAvailability(
  slug: string,
  entries: readonly WritingListEntry[],
  currentSlug: string | null,
): SlugAvailability {
  const value = slug.trim();

  if (!value) {
    return { state: "empty" };
  }

  if (!SLUG_PATTERN.test(value)) {
    return {
      state: "invalid",
      message: "Lowercase letters, digits and single hyphens only.",
    };
  }

  if (currentSlug && value === currentSlug) {
    return { state: "current" };
  }

  const clash = entries.find((entry) => entry.slug === value);

  if (clash) {
    return {
      state: "taken",
      message: `“${clash.title}” already uses this slug.`,
    };
  }

  return { state: "free" };
}

/** Suggests a slug from a title, only while the editor has not typed their own. */
export function suggestSlug(title: string): string {
  return slugify(title);
}

export function sortWritingEntries(entries: readonly WritingListEntry[]): WritingListEntry[] {
  return [...entries].sort((a, b) => {
    // Drafts first (they are the ones with work outstanding), then newest.
    if (a.status !== b.status) {
      return a.status === "draft" ? -1 : 1;
    }

    const aDate = a.publicationDate ?? "";
    const bDate = b.publicationDate ?? "";

    if (aDate !== bDate) {
      return aDate < bDate ? 1 : -1;
    }

    return b.creationTime - a.creationTime;
  });
}

/** What each draft field is called in sentences, confirms and merge reviews. */
export const WRITING_FIELD_LABELS: Record<keyof WritingDraft, string> = {
  title: "Title", slug: "Address", teaser: "Teaser", coverImageUrl: "Cover image",
  body: "Body", bodyFormat: "Body format", tags: "Tags", authorProfileKeys: "Byline",
  status: "Publication state", publicationDate: "Publication date",
};

/** The public address a row of this kind lives at. */
export function writingAddress(kind: WritingKind, slug: string): string {
  return `${kind === "blog" ? "/blog" : "/articles"}/${slug || "<address>"}`;
}

/** "article" or "blog post", for sentences. */
export function writingKindNoun(kind: WritingKind): string {
  return kind === "blog" ? "blog post" : "article";
}

/** The fields a draft changed against what it was loaded from, in form order. */
export function changedWritingFields(baseline: WritingDraft, draft: WritingDraft): Array<keyof WritingDraft> {
  return (Object.keys(WRITING_FIELD_LABELS) as Array<keyof WritingDraft>).filter(
    (key) => JSON.stringify(draft[key]) !== JSON.stringify(baseline[key]),
  );
}

/** A list in words: "the title, the body and the tags". */
export function joinWords(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "You changed the title and the body." for a publish confirm; empty when nothing changed. */
export function describeWritingChanges(keys: readonly (keyof WritingDraft)[]): string {
  if (keys.length === 0) return "";
  return `You changed ${joinWords(keys.map((key) => `the ${WRITING_FIELD_LABELS[key].toLowerCase()}`))}.`;
}

/**
 * What an admin's save does, from where the page is going and where it was:
 * the dock button, the confirm's title and its consequence sentence.
 */
export function writingSaveAction({
  status,
  wasPublished,
  isNew,
  title,
  address,
}: {
  status: WritingStatus;
  wasPublished: boolean;
  isNew: boolean;
  title: string;
  address: string;
}): { label: string; confirmTitle: string; consequence: string; tone: "live" | "private" } {
  const name = `“${title.trim() || "Untitled"}”`;
  if (status === "published") {
    return wasPublished
      ? { label: "Publish changes", confirmTitle: `Publish changes to ${name}?`, consequence: `Readers see them at ${address} as soon as it saves.`, tone: "live" }
      : { label: "Publish", confirmTitle: `Publish ${name}?`, consequence: `It goes live at ${address} as soon as it saves.`, tone: "live" };
  }
  if (wasPublished) {
    return { label: "Unpublish", confirmTitle: `Take ${name} off the site?`, consequence: `It is saved as a draft, and ${address} stops showing it.`, tone: "live" };
  }
  return {
    label: "Save draft",
    confirmTitle: isNew ? `Save ${name} as a new draft?` : `Save ${name} as a draft?`,
    consequence: "It stays off the public site until you publish it.",
    tone: "private",
  };
}

/** The one reason the open page cannot be saved right now, or null when it can. */
export function writingSaveBlocker({
  draft,
  slugAvailability,
  dateError,
  coverError,
  bodyError,
}: {
  draft: WritingDraft;
  slugAvailability: SlugAvailability;
  dateError: string | null;
  coverError: string | null;
  bodyError: string | null;
}): string | null {
  if (!draft.title.trim()) return "Add a title before saving.";
  if (slugAvailability.state === "empty") return "Add an address before saving.";
  if (slugAvailability.state === "invalid") return `Address: ${slugAvailability.message}`;
  if (slugAvailability.state === "taken") return `Address: ${slugAvailability.message} Pick another.`;
  if (bodyError) return "Fix the body markup before saving.";
  if (coverError) return `Cover image: ${coverError}`;
  if (dateError) return `Publication date: ${dateError}`;
  return null;
}

/** Entries split for the list: drafts (work outstanding) first, then the live ones. */
export function groupWritingEntries(entries: readonly WritingListEntry[]): { drafts: WritingListEntry[]; live: WritingListEntry[] } {
  const sorted = sortWritingEntries(entries);
  return { drafts: sorted.filter((entry) => entry.status === "draft"), live: sorted.filter((entry) => entry.status !== "draft") };
}

/** Whether an entry matches the list filter: title, address, teaser or tags. */
export function writingEntryMatches(entry: WritingListEntry, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${entry.title} ${entry.slug} ${entry.teaser ?? ""} ${(entry.tags ?? []).join(" ")}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** A stored publication date written out ("2 Nov 2025"), read in UTC; null when there is none. */
export function formatPublicationDate(value: string | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((value ?? "").trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
