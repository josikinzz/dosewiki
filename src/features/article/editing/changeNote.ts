import {
  articleFieldPathWords,
  describeProseDiff,
  fieldWords,
} from "@/data/changelog/articleRecentChanges";

import type { ArticleFieldChange } from "../../../../lib/proposals/articlePatch";
import { ARTICLE_SECTION_LABELS } from "./articleSections";

export const CHANGE_NOTE_MAX_LENGTH = 500;

const MAX_CLAUSES = 2;

export function sectionLabel(path: string): string {
  const head = path.split(/[.[ ]/, 1)[0];
  if (Object.prototype.hasOwnProperty.call(ARTICLE_SECTION_LABELS, head)) {
    return ARTICLE_SECTION_LABELS[head as keyof typeof ARTICLE_SECTION_LABELS];
  }
  if (head === "duration") return "Dosage and duration";
  if (head === "title") return "Title";
  return head;
}

export function fieldPlaceWords(path: string): string | null {
  const words = articleFieldPathWords(path);
  const segments = words.section ? words.field : words.field?.slice(1);
  return segments && segments.length > 0 ? fieldWords(segments) : null;
}

export function placeWords(path: string): string {
  const label = sectionLabel(path);
  const field = fieldPlaceWords(path);
  return field ? `${label} › ${field}` : label;
}

function referenceTitle(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("title" in value)) return null;
  const title = value.title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

function clauseFor(change: ArticleFieldChange): string {
  if (change.path.endsWith(" order")) return `reordered ${sectionLabel(change.path)}`;

  if (change.path.startsWith("references[")) {
    const title = referenceTitle(change.after) ?? referenceTitle(change.before);
    const verb = change.before == null ? "added" : change.after == null ? "removed" : "updated";
    return title ? `${verb} the source ${title}` : `${verb} a source`;
  }

  if (typeof change.before === "string" && typeof change.after === "string") {
    const described = describeProseDiff(`-${change.before}\n+${change.after}`);
    const verb = described.charAt(0).toLowerCase() + described.slice(1);
    return `${verb} in ${placeWords(change.path)}`;
  }

  const place = placeWords(change.path);
  if (change.before == null) return `filled in ${place}`;
  if (change.after == null) return `cleared ${place}`;
  return `updated ${place}`;
}

function fitToLimit(note: string): string {
  if (note.length <= CHANGE_NOTE_MAX_LENGTH) return note;
  const room = CHANGE_NOTE_MAX_LENGTH - 1;
  const cut = note.slice(0, room);
  const boundary = cut.lastIndexOf(" ");
  return `${(boundary > 0 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

export function synthesizeChangeNote(changes: ArticleFieldChange[]): string {
  if (changes.length === 0) return "";

  const clauses = changes.slice(0, MAX_CLAUSES).map(clauseFor);
  const remaining = changes.length - clauses.length;
  if (remaining > 0) {
    clauses.push(remaining === 1 ? "changed one more field" : `changed ${remaining} more fields`);
  }

  const sentence = clauses.length > 1
    ? `${clauses.slice(0, -1).join(", ")} and ${clauses[clauses.length - 1]}`
    : clauses[0];
  return fitToLimit(sentence.charAt(0).toUpperCase() + sentence.slice(1));
}
