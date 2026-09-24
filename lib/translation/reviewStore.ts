import "server-only";
import { getPostgresClient } from "@server/postgres/runtime/backend";
import type { SqlExecutor } from "../postgres/runtime/db";
import { assertDataWritesNotFrozen } from "../runtime/dataWriteFreeze";
import type { ReviewEntry, ReviewHistoryEntry, ReviewMutation, ReviewScope, ReviewSnapshot, ReviewState } from "./reviewTypes";
import { decodeReviewReason, encodeReviewReason, parseReviewReason } from "./reviewReason";
import { glossaryConflictMessage, type GlossaryRendering } from "./glossaryConflicts";

export type ReviewTransaction = Pick<SqlExecutor, "query">;
export class TranslationReviewError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "TRANSLATION_REVIEW_INVALID") { super(message); }
}
export class TranslationReviewConflictError extends TranslationReviewError {
  constructor() { super("This translation changed since you opened it. Reload and review the latest revision.", 409, "TRANSLATION_REVIEW_CONFLICT"); }
}
/** A correction leaves out approved glossary renderings its English mentions, and the reviewer did not mark them "Fine here". */
export class GlossaryConflictError extends TranslationReviewError {
  constructor(readonly conflicts: GlossaryRendering[]) { super(conflicts.map(glossaryConflictMessage).join(" "), 409, "GLOSSARY_CONFLICT"); }
}
type StoredEntry ={ locale: string; scope: ReviewScope; source_id: string; revision: number; draft: ReviewSnapshot | null; approved: ReviewSnapshot | null; updated_at: number };
function entry(row: StoredEntry): ReviewEntry {
  return { locale: row.locale, scope: row.scope, sourceId: row.source_id, revision: Number(row.revision), draft: row.draft, approved: row.approved, updatedAt: Number(row.updated_at) };
}
export async function readReviewEntries(locale: string, scope: ReviewScope): Promise<ReviewEntry[]> {
  const rows = await getPostgresClient().sql<StoredEntry>('SELECT * FROM "translationReviewEntries" WHERE "locale" = $1 AND "scope" = $2 ORDER BY "source_id"', [locale, scope]);
  return rows.map(entry);
}
export async function readReviewHistory(locale: string, scope: ReviewScope, sourceId: string): Promise<ReviewHistoryEntry[]> {
  const rows = await getPostgresClient().sql<{ revision: number; action: ReviewHistoryEntry["action"]; before_state: ReviewState; after_state: ReviewState; actor: string; reason: string; created_at: number }>(
    'SELECT "revision", "action", "before_state", "after_state", "actor", "reason", "created_at" FROM "translationReviewHistory" WHERE "locale" = $1 AND "scope" = $2 AND "source_id" = $3 ORDER BY "revision" DESC', [locale, scope, sourceId]);
  return rows.map((row) => ({ revision: Number(row.revision), action: row.action, before: row.before_state, after: row.after_state, actor: row.actor, ...decodeReviewReason(row.reason), createdAt: Number(row.created_at) }));
}
export type ReviewMutationOptions = {
  seedApproved?: ReviewSnapshot | null;
  seedDraft?: ReviewSnapshot | null;
  beforeTransition?: (tx: ReviewTransaction, current: ReviewEntry) => Promise<void>;
  onApprove?: (tx: ReviewTransaction, snapshot: ReviewSnapshot) => Promise<void>;
};
/** Characters a saved target may hold. A style guide is one JSON document of rules and examples. */
const TARGET_LIMIT: Record<ReviewScope, number> = { ui: 2000, glossary: 2000, note: 2000, narrative: 30000, "qa-exception": 30000, "model-suggestion": 30000, "style-guide": 250000 };
function validateInput(input: ReviewMutation): void {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new TranslationReviewError("An expected revision is required.");
  if (!input.actor?.trim() || !parseReviewReason(input.reason)) throw new TranslationReviewError("An actor and a reason of up to 1000 characters are required.");
  if (!Object.prototype.hasOwnProperty.call(TARGET_LIMIT, input.scope) || !input.locale || !input.sourceId || !input.source || !input.context) throw new TranslationReviewError("A declared translation source and context are required.");
  if (!["save", "approve", "restore"].includes(input.action)) throw new TranslationReviewError("Unknown review action.");
  if (input.action === "save" && (typeof input.target !== "string" || !input.target.trim() || input.target.length > TARGET_LIMIT[input.scope])) throw new TranslationReviewError("Enter a translation within the scope character limit.");
  if (input.action === "restore" && (input.restoreRevision === undefined || !Number.isSafeInteger(input.restoreRevision) || input.restoreRevision < 0)) throw new TranslationReviewError("Choose a valid revision to restore.");
}
/** Call inside one transaction to read the row a compound transition will change; null before its first write. */
export async function lockReviewEntry(tx: ReviewTransaction, locale: string, scope: ReviewScope, sourceId: string): Promise<ReviewEntry | null> {
  const locked = await tx.query('SELECT * FROM "translationReviewEntries" WHERE "locale" = $1 AND "scope" = $2 AND "source_id" = $3 FOR UPDATE', [locale, scope, sourceId]);
  return locked.rows[0] ? entry(locked.rows[0] as StoredEntry) : null;
}
/** Call inside one transaction. The placeholder row serializes first-writer races. */
export async function mutateReviewEntryInTransaction(tx: ReviewTransaction, input: ReviewMutation, options: ReviewMutationOptions = {}): Promise<ReviewEntry> {
  assertDataWritesNotFrozen("mutateReviewEntry");
  validateInput(input);
  const keys = [input.locale, input.scope, input.sourceId];
  await tx.query('INSERT INTO "translationReviewEntries" ("locale", "scope", "source_id", "revision", "draft", "approved", "updated_at") VALUES ($1,$2,$3,0,$4::jsonb,$5::jsonb,0) ON CONFLICT DO NOTHING', [...keys, JSON.stringify(options.seedDraft ?? null), JSON.stringify(options.seedApproved ?? null)]);
  const locked = await tx.query('SELECT * FROM "translationReviewEntries" WHERE "locale" = $1 AND "scope" = $2 AND "source_id" = $3 FOR UPDATE', keys);
  const current = entry(locked.rows[0] as StoredEntry);
  if (current.revision !== input.expectedRevision) throw new TranslationReviewConflictError();
  await options.beforeTransition?.(tx, current);
  const before: ReviewState = { revision: current.revision, draft: current.draft, approved: current.approved };
  const after: ReviewState = { ...before, revision: before.revision + 1 };
  if (input.action === "save") after.draft = { source: input.source, context: input.context, target: (input.target ?? "").trim() };
  if (input.action === "restore") {
    const history = input.restoreRevision === 0
      ? await tx.query('SELECT "before_state" AS "restore_state" FROM "translationReviewHistory" WHERE "locale" = $1 AND "scope" = $2 AND "source_id" = $3 AND "revision" = 1', keys)
      : await tx.query('SELECT "after_state" AS "restore_state" FROM "translationReviewHistory" WHERE "locale" = $1 AND "scope" = $2 AND "source_id" = $3 AND "revision" = $4', [...keys, input.restoreRevision]);
    const old = history.rows[0]?.restore_state as ReviewState | undefined;
    const snapshot = old?.draft ?? old?.approved;
    if (!snapshot) throw new TranslationReviewError("That revision has no translation to restore.", 404);
    // Preserve historical meaning so an old-source restore requires saving a new draft before approval.
    after.draft = snapshot;
  }
  if (input.action === "approve") {
    if (!before.draft) throw new TranslationReviewError("Save a draft before approving it.");
    if (before.draft.source !== input.source || before.draft.context !== input.context) throw new TranslationReviewError("The English source or context changed. Save a new draft before approval.", 409);
    await options.onApprove?.(tx, before.draft);
    after.approved = before.draft;
    after.draft = null;
  }
  const now = Date.now();
  await tx.query('UPDATE "translationReviewEntries" SET "revision"=$4,"draft"=$5::jsonb,"approved"=$6::jsonb,"updated_at"=$7 WHERE "locale"=$1 AND "scope"=$2 AND "source_id"=$3', [...keys, after.revision, JSON.stringify(after.draft), JSON.stringify(after.approved), now]);
  await tx.query('INSERT INTO "translationReviewHistory" ("locale","scope","source_id","revision","action","before_state","after_state","actor","reason","created_at") VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)', [...keys, after.revision, input.action, JSON.stringify(before), JSON.stringify(after), input.actor, encodeReviewReason(parseReviewReason(input.reason)!, input.glossaryExceptions), now]);
  return { ...current, ...after, updatedAt: now };
}
export async function mutateReviewEntry(input: ReviewMutation, options: ReviewMutationOptions = {}): Promise<ReviewEntry> {
  assertDataWritesNotFrozen("mutateReviewEntry");
  return getPostgresClient().sqlTransaction((tx) => mutateReviewEntryInTransaction(tx, input, options));
}
export async function mutateReviewEntries(inputs: readonly ReviewMutation[], options: readonly ReviewMutationOptions[] = []): Promise<ReviewEntry[]> {
  assertDataWritesNotFrozen("mutateReviewEntries");
  return getPostgresClient().sqlTransaction(async (tx) => {
    const results: ReviewEntry[] = [];
    for (const [i, input] of inputs.entries()) results.push(await mutateReviewEntryInTransaction(tx, input, options[i]));
    return results;
  });
}
