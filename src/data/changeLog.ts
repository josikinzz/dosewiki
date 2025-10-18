import activeEntries from "./devChangeLog.json";
import archivedEntries from "./devChangeLog.archive.json";

/**
 * Change log entry captured from the Dev Tools GitHub workflow.
 * Persisted in src/data/devChangeLog.json (recent entries) and src/data/devChangeLog.archive.json (older entries).
 * Both files are merged client-side so the Change log tab shows the complete history without hitting GitHub's
 * 1 MB contents API limit for the writable file.
 */
export type ChangeLogEntry = {
  id: string;
  createdAt: string;
  commit: {
    sha: string;
    url: string;
    message: string;
  };
  articles: ChangeLogArticleSummary[];
  markdown: string; // unified diff text; name retained for backwards compatibility
  submittedBy: string | null;
};

export type ChangeLogArticleSummary = {
  id: number;
  title: string;
  slug: string;
};

export const CHANGE_LOG_MAX_ENTRIES = 250;

const normalizeArticles = (articles: unknown): ChangeLogArticleSummary[] => {
  if (!Array.isArray(articles)) {
    return [];
  }

  return articles
    .map((article) => {
      if (typeof article !== "object" || article === null) {
        return null;
      }

      const id = Number((article as { id?: unknown }).id ?? Number.NaN);
      const title = typeof (article as { title?: unknown }).title === "string" ? (article as { title: string }).title : "";
      const slug = typeof (article as { slug?: unknown }).slug === "string" ? (article as { slug: string }).slug : "";

      if (!Number.isFinite(id) || !title || !slug) {
        return null;
      }

      return { id, title, slug } satisfies ChangeLogArticleSummary;
    })
    .filter((value): value is ChangeLogArticleSummary => value !== null);
};

const normalizeEntries = (entries: unknown): ChangeLogEntry[] => {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return null;
      }

      const { id, createdAt, commit, markdown } = entry as ChangeLogEntry;
      if (typeof id !== "string" || typeof createdAt !== "string" || typeof markdown !== "string") {
        return null;
      }

      if (!commit || typeof commit !== "object") {
        return null;
      }

      const { sha, url, message } = commit as ChangeLogEntry["commit"];
      if (typeof sha !== "string" || typeof url !== "string" || typeof message !== "string") {
        return null;
      }

      const rawSubmittedBy = (entry as { submittedBy?: unknown }).submittedBy;
      const submittedBy =
        typeof rawSubmittedBy === "string" && rawSubmittedBy.trim().length > 0
          ? rawSubmittedBy.trim()
          : null;

      return {
        id,
        createdAt,
        markdown,
        commit: { sha, url, message },
        articles: normalizeArticles((entry as { articles?: unknown }).articles),
        submittedBy,
      } satisfies ChangeLogEntry;
    })
    .filter((value): value is ChangeLogEntry => value !== null);
};

const rawEntries = [...(Array.isArray(activeEntries) ? activeEntries : []), ...(Array.isArray(archivedEntries) ? archivedEntries : [])];

export const initialChangeLogEntries = normalizeEntries(rawEntries);

export const sortChangeLogEntries = (entries: ChangeLogEntry[]): ChangeLogEntry[] =>
  [...entries].sort((a, b) => {
    const delta = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (delta !== 0) {
      return delta;
    }

    return b.id.localeCompare(a.id);
  });

export const appendChangeLogEntry = (
  entries: ChangeLogEntry[],
  next: ChangeLogEntry,
  limit = CHANGE_LOG_MAX_ENTRIES,
): ChangeLogEntry[] => {
  const merged = [...entries, next];
  return sortChangeLogEntries(merged).slice(0, limit);
};

export type ArticleFrequency = {
  id: number;
  title: string;
  slug: string;
  count: number;
};

export const buildArticleFrequencyIndex = (entries: ChangeLogEntry[]): ArticleFrequency[] => {
  const counter = new Map<string, ArticleFrequency>();

  for (const entry of entries) {
    for (const article of entry.articles) {
      const key = article.slug;
      const existing = counter.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counter.set(key, { ...article, count: 1 });
      }
    }
  }

  return [...counter.values()].sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }

    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
};
