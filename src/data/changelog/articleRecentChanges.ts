import { diffArrays } from "diff";
import { msg } from "@/i18n/messages";

import type { ChangeLogArticleSummary } from "./changeLog";
import {
  CITATION_MARKER_PATTERN,
  CITATION_NEEDED_TOKEN,
} from "@/lib/citations/citationTokens";
import { getPublicTocSectionEntries } from "@/schema/substance/sectionManifest";

/**
 * How many other articles of one bulk save the article surface names before
 * it falls back to "and N more". The row renderer and the article projection
 * that trims `articles` share this number.
 */
export const NAMED_SIBLINGS = 3;

/** One public history summary. Diff text is fetched only when expanded. */
export type ArticleRecentChange = {
  id: string;
  /** ISO timestamp of the save. */
  createdAt: string;
  /**
   * `prose`: one field edited in place, with a Before/After diff to show.
   * `source`: a reference added or removed; the row text is the whole story.
   * `bulk`: a Dev-editor save, described by its own message.
   */
  kind: "prose" | "source" | "bulk";
  /** What the edit did, in reader words: "Added a citation", "Reworded 3 words". */
  message: string;
  /** For `source` rows, the reference title; for `bulk`, the save note. */
  detail: string | null;
  /** The public section the edited field lives in, when it has an anchor. */
  section: { id: string; label: string } | null;
  /**
   * The field inside that section, one entry per path segment as words
   * ("Psychosis", "Description"). An array index rides on its parent segment
   * ("Routes" 1) so the label can be translated on its own and the number
   * appended at render.
   */
  field: ChangeFieldSegment[] | null;
  contributor: {
    name: string;
    href: string | null;
    avatarUrl: string | null;
  } | null;
  /** Whether this entry has a permitted diff available on expansion. */
  hasDiff: boolean;
  /**
   * Every article the same save touched, in the order the save recorded them.
   *
   * The article surface names only the first few siblings, so its projection
   * trims this to that subset and reports the real count in `siblingTotal`.
   * A bulk save can touch every substance, and serializing all of them into
   * one article document costs far more than the row renders.
   */
  articles: ChangeLogArticleSummary[];
  /**
   * How many other articles the save touched, when `articles` carries only
   * the named subset. Absent on the site-wide feed, which lists them all.
   */
  siblingTotal?: number;
  /** The article this row was read for; null on the site-wide feed. */
  subjectSlug: string | null;
};

/** The reader-facing description of a save, before contributor resolution. */
export type ChangeFieldSegment = { label: string; index: number | null };

/**
 * "Routes 1 › Dose ranges › Heavy": each label reads as words, the index stays
 * a number. Shared by the public ledger row (which translates each label) and
 * the dev change log, whose surface is English-only.
 */
export function fieldWords(
  segments: ChangeFieldSegment[],
  label = (text: string) => text,
): string {
  return segments
    .map((segment) =>
      segment.index === null
        ? label(segment.label)
        : `${label(segment.label)} ${segment.index}`,
    )
    .join(" › ");
}

export type ChangeDescription = Pick<
  ArticleRecentChange,
  "kind" | "message" | "detail" | "section" | "field"
>;

const SECTION_HEADING = /^# (.+)$/;
const INLINE_EDIT_MESSAGE = /^Inline edit — ([\w.[\]]+)$/;
const SOURCE_MESSAGE = /^(Added|Removed) a source — (.+)$/;
const BULK_MESSAGE = /^Dev editor update - (.+)$/;

/**
 * Splits prose into diffable tokens. A citation marker (`[cite:doi-…]`,
 * `[citation-needed]`) is one token: a word diff inside it turns a swapped
 * source into struck and inserted fragments the reader cannot parse.
 * Everything else splits into words and the whitespace between them, so
 * unchanged spacing is preserved verbatim.
 */
export const DIFF_TOKEN = /\[[^\]]*\]|\s+|[^\s[]+|\[/g;

const isWhitespace = (token: string) => /^\s+$/.test(token);
const isCitation = (token: string) => {
  CITATION_MARKER_PATTERN.lastIndex = 0;
  const match = CITATION_MARKER_PATTERN.exec(token);
  return match !== null && match[0] === token;
};

const sectionsByField: Record<string, { id: string; label: string }> = {};
for (const entry of getPublicTocSectionEntries()) {
  for (const fieldKey of entry.articleFields) {
    sectionsByField[fieldKey] ??= { id: entry.id, label: entry.label };
  }
}

function toWords(segment: string): string {
  const words = segment.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Summarise the `-`/`+` pairs of an inline edit by what moved: citations
 * added or removed, a citation-needed flag cleared, and words changed.
 */
/**
 * The single-clause sentences `describeProseDiff` can produce, listed so the
 * locale catalog carries them; the row renders `t(message)`. A compound
 * sentence ("Added a citation and reworded 2 words") stays English.
 */

export function describeProseDiff(diff: string): string {
  const removed: string[] = [];
  const added: string[] = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("-")) removed.push(line.slice(1).trim());
    else if (line.startsWith("+")) added.push(line.slice(1).trim());
  }
  const parts = diffArrays(
    removed.join("\n").match(DIFF_TOKEN) ?? [],
    added.join("\n").match(DIFF_TOKEN) ?? [],
  );

  let citationsAdded = 0;
  let citationsRemoved = 0;
  let flagsCleared = 0;
  // A word swapped for another is one change, not a removal plus an
  // addition: count each side and take the larger.
  let wordsRemoved = 0;
  let wordsAdded = 0;
  for (const part of parts) {
    if (!part.added && !part.removed) continue;
    for (const token of part.value) {
      if (isWhitespace(token)) continue;
      if (token === CITATION_NEEDED_TOKEN) {
        if (part.removed) flagsCleared += 1;
      } else if (isCitation(token)) {
        if (part.added) citationsAdded += 1;
        else citationsRemoved += 1;
      } else if (part.added) {
        wordsAdded += 1;
      } else {
        wordsRemoved += 1;
      }
    }
  }
  const wordsChanged = Math.max(wordsAdded, wordsRemoved);

  const clauses: string[] = [];
  if (flagsCleared > 0 && citationsAdded > 0) {
    clauses.push(
      citationsAdded === 1
        ? "sourced a claim"
        : `sourced ${citationsAdded} claims`,
    );
  } else {
    if (citationsAdded > 0)
      clauses.push(
        citationsAdded === 1
          ? "added a citation"
          : `added ${citationsAdded} citations`,
      );
    if (flagsCleared > 0) clauses.push("cleared a citation-needed flag");
  }
  if (citationsRemoved > 0)
    clauses.push(
      citationsRemoved === 1
        ? "removed a citation"
        : `removed ${citationsRemoved} citations`,
    );
  if (wordsChanged > 0)
    clauses.push(
      wordsChanged === 1 ? "changed a word" : `reworded ${wordsChanged} words`,
    );
  if (clauses.length === 0) clauses.push("edited");

  const sentence =
    clauses.length > 1
      ? `${clauses.slice(0, -1).join(", ")} and ${clauses[clauses.length - 1]}`
      : clauses[0];
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * "dosage.routes[0].dose_ranges.heavy" as words: the public section the field
 * belongs to, and the field inside it. An array index rides on its parent
 * segment, so it reads as "Routes 1" rather than a bare number.
 *
 * Shared by the changelog row and the editor's prefilled change note, so a
 * field is named the same way wherever a person reads about it.
 */
export function articleFieldPathWords(
  path: string,
): Pick<ChangeDescription, "section" | "field"> {
  const segments = path
    .split(".")
    .filter((segment) => segment.length > 0)
    .map((segment): ChangeFieldSegment => {
      const indexed = /^(.*)\[(\d+)\]$/.exec(segment);
      return indexed
        ? { label: toWords(indexed[1]), index: Number(indexed[2]) + 1 }
        : { label: toWords(segment), index: null };
    });
  const [head, ...rest] = segments;
  const headKey = path.split(".")[0].replace(/\[\d+\]$/, "");
  const section = sectionsByField[headKey] ?? null;
  const fieldSegments = section ? rest : [head, ...rest];
  return { section, field: fieldSegments.length > 0 ? fieldSegments : null };
}

/**
 * Turn a stored save message and its sliced diff into what a reader should
 * see: a verb phrase, the section it happened in (linked when the section has
 * a public anchor), and the field inside it as words.
 *
 * Direct edits stamp the raw field path ("Inline edit — harm_potential.psychosis.description");
 * the verb comes from the diff and the path becomes "Harm Potential" + "Psychosis › Description".
 */
export function describeChange(
  message: string,
  diff: string,
): ChangeDescription {
  const trimmed = message.trim();

  const source = SOURCE_MESSAGE.exec(trimmed);
  if (source) {
    return {
      kind: "source",
      message: `${source[1]} a source`,
      detail: source[2].trim(),
      section: sectionsByField["references"] ?? null,
      field: null,
    };
  }

  const inline = INLINE_EDIT_MESSAGE.exec(trimmed);
  if (inline) {
    const words = articleFieldPathWords(inline[1]);
    return {
      kind: "prose",
      message: describeProseDiff(diff),
      detail: null,
      section: words.section,
      field: words.field,
    };
  }

  // The Dev editor stamps "Dev editor update - <locale timestamp>" when the
  // save has no message of its own; the row already shows the time, so the
  // stamp adds nothing. A hand-written note is worth keeping.
  const bulk = BULK_MESSAGE.exec(trimmed);
  const note = bulk ? bulk[1].trim() : trimmed;
  const isTimestamp =
    /^\d{1,2}\/\d{1,2}\/\d{4}(?:[ ,]+\d{1,2}:\d{2}(?::\d{2})?(?: ?[AP]M)?)?$/i.test(
      note,
    );
  return {
    kind: "bulk",
    message: msg("Updated the article"),
    detail: note.length > 0 && !isTimestamp ? note : null,
    section: null,
    field: null,
  };
}

const CHURN_WINDOW_MS = 60 * 60 * 1000;
const CHURN_PARTNER: Record<string, { partner: string; merged: string }> = {
  [msg("Added a source")]: {
    partner: msg("Removed a source"),
    merged: msg("Re-added a source"),
  },
  [msg("Removed a source")]: {
    partner: msg("Added a source"),
    merged: msg("Added, then removed a source"),
  },
};

/**
 * A source added and removed (in either order) by the same contributor within
 * an hour is one event, not churn: collapse the pair (newest first) into the
 * newer row so the ledger does not read as indecision.
 */
export function mergeSourceChurn<
  T extends Pick<
    ArticleRecentChange,
    "kind" | "message" | "detail" | "createdAt"
  > & { submittedBy: string | null },
>(changes: T[]): T[] {
  const merged: T[] = [];
  const consumed = new Set<number>();
  for (let i = 0; i < changes.length; i += 1) {
    if (consumed.has(i)) continue;
    const change = changes[i];
    const churn =
      change.kind === "source" ? CHURN_PARTNER[change.message] : undefined;
    if (churn) {
      const partner = changes.findIndex(
        (candidate, j) =>
          j > i &&
          !consumed.has(j) &&
          candidate.kind === "source" &&
          candidate.message === churn.partner &&
          candidate.detail === change.detail &&
          candidate.submittedBy === change.submittedBy &&
          Date.parse(change.createdAt) - Date.parse(candidate.createdAt) <
            CHURN_WINDOW_MS,
      );
      if (partner !== -1) {
        consumed.add(partner);
        merged.push({ ...change, message: churn.merged });
        continue;
      }
    }
    merged.push(change);
  }
  return merged;
}

/**
 * Bulk Dev-editor saves store one diff for every article they touched, one
 * `# <Title> · #<id>` section per article (`formatArticleLabel`); direct edits
 * store a single `# <Title>` section. Return only this article's section body.
 *
 * A diff with no section headings is returned whole. A diff whose headings
 * never match falls back to its only section when it has exactly one, and to
 * nothing otherwise: showing another article's changes here would be wrong.
 */
export function sliceArticleDiff(
  markdown: string,
  article: ChangeLogArticleSummary,
): string {
  const lines = markdown.split("\n");
  const sections: { heading: string; body: string[] }[] = [];
  let current: { heading: string; body: string[] } | null = null;

  for (const line of lines) {
    const heading = SECTION_HEADING.exec(line);
    if (heading) {
      current = { heading: heading[1].trim(), body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }

  if (sections.length === 0) {
    return markdown.trim();
  }

  const title = article.title.trim().toLowerCase();
  const idSuffix = `#${article.id}`;
  const match =
    sections.find((section) => {
      const heading = section.heading.toLowerCase();
      return (
        heading === title ||
        heading.endsWith(`· ${idSuffix}`) ||
        heading === idSuffix
      );
    }) ?? (sections.length === 1 ? sections[0] : null);

  if (!match) {
    return "";
  }

  const body = match.body.join("\n").trim();
  return body === "No differences detected." ||
    body === "No data available for comparison."
    ? ""
    : body;
}
