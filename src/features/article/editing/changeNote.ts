import {
  articleFieldPathWords,
  describeProseDiff,
  fieldWords,
} from "@/data/changelog/articleRecentChanges";

import { ARTICLE_SECTION_LABELS } from "./ArticleSectionForm";
import type { ArticleFieldChange } from "./ArticleChangeDiff";

/**
 * The change note the publish confirmation opens with.
 *
 * The write layer requires a note of 1 to 500 characters for publish, submit,
 * and restore. Writing one by hand for "added a citation" is the step editors
 * report as ceremony, so the editor arrives with the note already filled and
 * edits it only when the change deserves more than the diff already says.
 *
 * Wording comes from the changelog's own describer, so the note a reviewer
 * confirms reads the way the resulting Recent changes row will read.
 */

/** The write layer's cap. A longer note is refused, so never offer one. */
export const CHANGE_NOTE_MAX_LENGTH = 500;

/** How many field clauses a note spells out before it counts the rest. */
const MAX_CLAUSES = 2;

function sectionLabel(path: string): string {
  const head = path.split(/[.[ ]/, 1)[0];
  if (head in ARTICLE_SECTION_LABELS) {
    return ARTICLE_SECTION_LABELS[head as keyof typeof ARTICLE_SECTION_LABELS];
  }
  if (head === "duration") return "Dosage and duration";
  if (head === "title") return "Title";
  return head;
}

/** "Dosage and duration › Routes 1 › Notes", or the section alone. */
function placeWords(path: string): string {
  const words = articleFieldPathWords(path);
  const label = sectionLabel(path);
  // A path whose head has no public section keeps that head as its first field
  // segment. The editor's own section label already names it, so dropping it
  // is what keeps a single-segment path from reading "Summary › Summary".
  const segments = words.section ? words.field : words.field?.slice(1);
  return segments && segments.length > 0 ? `${label} › ${fieldWords(segments)}` : label;
}

/** A stored reference's title, when the value really carries a usable one. */
function referenceTitle(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("title" in value)) return null;
  const title = value.title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

/**
 * One change as a lower-case clause. Prose changes borrow the changelog's verb
 * phrase, so "added a citation" here and "Added a citation" in Recent changes
 * are the same sentence.
 */
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

/** Cuts at a word boundary so a truncated note never ends mid-word. */
function fitToLimit(note: string): string {
  if (note.length <= CHANGE_NOTE_MAX_LENGTH) return note;
  const room = CHANGE_NOTE_MAX_LENGTH - 1;
  const cut = note.slice(0, room);
  const boundary = cut.lastIndexOf(" ");
  return `${(boundary > 0 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

/**
 * Describe a set of field changes in one sentence, within the write layer's
 * length cap. Empty when nothing changed, which is also when publishing is
 * refused, so the caller has nothing to offer and nothing to send.
 */
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
