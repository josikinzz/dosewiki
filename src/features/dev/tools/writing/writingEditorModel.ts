import { slugify } from "@/utils/slug";

export type WritingKind = "article" | "blog";
export type WritingStatus = "draft" | "published";

/** One row of `effectIndexArticles.listForEditor`. */
export interface WritingListEntry {
  slug: string;
  title: string;
  kind: WritingKind;
  status: WritingStatus;
  publicationDate?: string;
  creationTime: number;
  teaser?: string;
}

/** The whole row, as `effectIndexArticles.getForEditor` returns it. */
export interface WritingArticleRow {
  slug: string;
  title: string;
  tags?: string[];
  kind?: WritingKind;
  status?: WritingStatus;
  bodyFormat?: "vcode" | "markdown";
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
  tags: string;
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
    tags: "",
    authorProfileKeys: [],
    status: "draft",
    publicationDate: todayIso(),
  };
}

export function draftFromRow(row: WritingArticleRow): WritingDraft {
  return {
    slug: row.slug,
    title: row.title,
    teaser: row.teaser ?? "",
    coverImageUrl: row.coverImageUrl ?? "",
    body: row.body_raw ?? "",
    tags: (row.tags ?? []).join(", "),
    authorProfileKeys: [...(row.authorProfileKeys ?? [])],
    status: row.status ?? "published",
    publicationDate: row.publicationDate ?? "",
  };
}

export function parseTagList(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/**
 * A legacy Effect Index row is VCode, and this editor writes Markdown. Opening
 * one here would offer to rewrite its body in a language it is not written in,
 * so the tab shows it as read-only instead of pretending otherwise.
 */
export function isEditableHere(row: WritingArticleRow): boolean {
  return (row.bodyFormat ?? "vcode") === "markdown";
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
