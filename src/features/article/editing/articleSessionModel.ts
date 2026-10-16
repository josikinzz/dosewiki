import type { ArticleFieldChange } from "../../../../lib/proposals/articlePatch";
import { sectionLabel } from "./changeNote";

export type LifecycleAction = "saveDraft" | "discardDraft" | "publish" | "submit" | "restore";

export type LifecycleFailureKind = "frozen" | "conflict" | "refused" | "unconfirmed";
export type LifecycleFailure = { kind: LifecycleFailureKind; action: LifecycleAction; message: string };

export function classifyLifecycleFailure(status: number, code: unknown): Exclude<LifecycleFailureKind, "unconfirmed"> | null {
  if (status === 503 && code === "DATA_WRITES_FROZEN") return "frozen";
  if (status === 409 && code === "ARTICLE_CONFLICT") return "conflict";
  if (status >= 400 && status < 500) return "refused";
  return null;
}

const ACTION_OUTCOME: Record<LifecycleAction, string> = {
  saveDraft: "your draft was not saved",
  discardDraft: "your saved draft was not discarded",
  publish: "your changes were not published",
  submit: "your changes were not submitted",
  restore: "the revision was not restored",
};

export function describeLifecycleFailure(failure: LifecycleFailure): string {
  if (failure.kind === "frozen") {
    return `Writes are paused, so ${ACTION_OUTCOME[failure.action]}. Your edits stay here.`;
  }
  if (failure.kind === "conflict") {
    if (failure.action === "saveDraft" || failure.action === "discardDraft") {
      return `Your private draft changed in another tab, so ${ACTION_OUTCOME[failure.action]}. Your edits stay here.`;
    }
    return `Someone published this article after you opened it, so ${ACTION_OUTCOME[failure.action]}. Your edits stay here.`;
  }
  return failure.message;
}

export function changedSections(changes: readonly ArticleFieldChange[]): string[] {
  const labels: string[] = [];
  for (const change of changes) {
    const label = sectionLabel(change.path);
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
}

function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function describeChangedSections(changes: readonly ArticleFieldChange[]): string {
  const sections = changedSections(changes);
  if (sections.length === 0) return "Nothing changed.";
  return `You changed ${joinWords(sections)}.`;
}

const SAFETY_HEADS = new Set(["dosage", "duration", "interactions"]);

export function safetyChanges(changes: readonly ArticleFieldChange[]): ArticleFieldChange[] {
  return changes.filter((change) => SAFETY_HEADS.has(change.path.split(/[.[ ]/, 1)[0]));
}

export function countChanges(count: number): string {
  return count === 1 ? "1 change" : `${count} changes`;
}

export function describeDraftState({ busy, localDirty, hasDraft, changeCount }: {
  busy: string | null; localDirty: boolean; hasDraft: boolean; changeCount: number;
}): { text: string; unsaved: boolean } {
  if (busy) return { text: busy, unsaved: false };
  if (localDirty) return { text: changeCount > 0 ? `Unsaved edits, ${countChanges(changeCount)} from the live article` : "Unsaved edits", unsaved: true };
  if (hasDraft) return { text: changeCount > 0 ? `Draft saved, ${countChanges(changeCount)} not live yet` : "Draft saved", unsaved: false };
  return { text: changeCount > 0 ? `${countChanges(changeCount)} not live yet` : "No changes yet", unsaved: false };
}

export const PENDING_WORDS: Record<LifecycleAction, string> = {
  saveDraft: "Saving your draft",
  discardDraft: "Discarding your saved draft",
  publish: "Publishing",
  submit: "Submitting for review",
  restore: "Restoring",
};
