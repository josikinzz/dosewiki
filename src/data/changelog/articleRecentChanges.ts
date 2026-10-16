import { diffArrays } from "diff";
import { msg } from "@/i18n/messages";

import type { ChangeLogArticleSummary } from "./changeLog";
import {
  CITATION_MARKER_PATTERN,
  CITATION_NEEDED_TOKEN,
} from "@/lib/citations/citationTokens";
import { getPublicTocSectionEntries } from "@/schema/substance/sectionManifest";
import { ROUTE_LABELS } from "@/features/article/components/sections/routeLabels";

export const NAMED_SIBLINGS = 3;

export type ArticleRecentChange = {
  id: string;
  createdAt: string;
  kind: "prose" | "source" | "bulk";
  message: string;
  detail: string | null;
  section: { id: string; label: string } | null;
  field: ChangeFieldSegment[] | null;
  contributor: {
    name: string;
    href: string | null;
    avatarUrl: string | null;
  } | null;
  hasDiff: boolean;
  articles: ChangeLogArticleSummary[];
  siblingTotal?: number;
  subjectSlug: string | null;
};

export type ChangeFieldSegment = { label: string; index: number | null };

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
const INLINE_EDIT_MESSAGE = /^Inline edit \u2014 ([\w.[\]]+)$/;
const SOURCE_MESSAGE = /^(Added|Removed) a source \u2014 (.+)$/;
const BULK_MESSAGE = /^Dev editor update - (.+)$/;

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

export function articleFieldPathWords(
  path: string,
): Pick<ChangeDescription, "section" | "field"> {
  const parts = path.split(/\.(?![^[]*\])/).filter((segment) => segment.length > 0);
  const segments = parts.flatMap((segment): ChangeFieldSegment[] => {
    const indexed = /^(.*)\[(\d+)\]$/.exec(segment);
    if (indexed) return [{ label: toWords(indexed[1]), index: Number(indexed[2]) + 1 }];
    const keyed = /^([^[]*)\[([^\]]+)\]$/.exec(segment);
    if (keyed) {
      return keyed[1] === "routes"
        ? [{ label: ROUTE_LABELS[keyed[2].toLowerCase()] ?? toWords(keyed[2]), index: null }]
        : [{ label: toWords(keyed[1]), index: null }, { label: keyed[2], index: null }];
    }
    return [{ label: toWords(segment), index: null }];
  });
  const [head, ...rest] = segments;
  const headKey = (parts[0] ?? "").replace(/\[[^\]]*\]$/, "");
  const section = sectionsByField[headKey] ?? null;
  const fieldSegments = section ? rest : [head, ...rest];
  return { section, field: fieldSegments.length > 0 ? fieldSegments : null };
}

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
