import "server-only";
import { getUiMessageInventoryDefinition, UI_MESSAGE_INVENTORY } from "./uiWorkbenchDefinitions";
import { resolveLocale } from "../../scripts/translation/locales.mjs";
import { BLOCKING_DEFECTS, validateSegment } from "../../scripts/translation/validate.mjs";
import { getPostgresClient } from "@server/postgres/runtime/backend";
import { assertDataWritesNotFrozen, isDataWriteFrozenError } from "../runtime/dataWriteFreeze";
import { lockReviewEntry, mutateReviewEntry, mutateReviewEntryInTransaction, readReviewEntries, readReviewHistory, TranslationReviewConflictError, TranslationReviewError, type ReviewMutationOptions } from "./reviewStore";
import type { ReviewAction, ReviewEntry, ReviewMutation } from "./reviewTypes";
import { getCompiledUiCatalog, getUiCatalogPendingRefresh } from "./uiCatalogs";
import { assertCorrectionKeepsGlossary, assertKeepsGlossaryIn, glossaryMentionsFor, readGlossaryMentionIndex } from "./glossaryConflictCheck";
import type { GlossaryMention } from "./glossaryConflicts";
import { isShortUiLabel, UI_BATCH_APPROVAL_REASON, type UiBatchApprovalItem, type UiBatchApprovalResult, type UiTranslationRow } from "./uiTranslationTypes";

function declared(id: string) {
  const definition = getUiMessageInventoryDefinition(id);
  if (!definition) throw new TranslationReviewError("Unknown UI message. Only declared messages can be edited.");
  return definition;
}
function rowFor(locale: string, id: string, entry?: ReviewEntry, glossary?: readonly GlossaryMention[]): UiTranslationRow {
  const definition = declared(id);
  const compiledTarget = getCompiledUiCatalog(locale)[definition.catalogKey] ?? null;
  const approved = entry?.approved ?? null;
  const draft = entry?.draft ?? null;
  const active = draft ?? approved;
  const status: UiTranslationRow["status"] = active && (active.source !== definition.source || active.context !== definition.context) ? "stale" : draft ? "draft" : approved ? "approved" : compiledTarget !== null ? "unreviewed" : "missing";
  // Human approval outranks the glossary, so an approved row never waits for a refresh.
  const waiting = status === "approved" ? undefined : getUiCatalogPendingRefresh(locale).entries.get(definition.catalogKey);
  return { id, ...definition, compiledTarget, revision: entry?.revision ?? 0, draft, approved, updatedAt: entry?.updatedAt ?? null, status,
    pendingRefresh: waiting ? { term: waiting.term, expectedTarget: waiting.expectedTarget } : null,
    ...(glossary ? { glossary: glossaryMentionsFor(definition.source, glossary) } : {}) };
}
export function isUiCatalogRefreshed(locale: string): boolean {
  return getUiCatalogPendingRefresh(locale).refreshed;
}
export async function readUiTranslations(locale: string, options: { approvedOnly?: boolean } = {}): Promise<UiTranslationRow[]> {
  resolveLocale(locale);
  // Waiting checks existing approvals only. It needs neither thousands of
  // unapproved catalog rows nor their glossary mention projections.
  if (options.approvedOnly) {
    const entries = await readReviewEntries(locale, "ui");
    return entries.filter((entry) => entry.approved && getUiMessageInventoryDefinition(entry.sourceId))
      .map((entry) => rowFor(locale, entry.sourceId, entry));
  }
  const [entries, glossary] = await Promise.all([readReviewEntries(locale, "ui"), readGlossaryMentionIndex(locale)]);
  const rows = new Map(entries.map((row) => [row.sourceId, row]));
  return Object.keys(UI_MESSAGE_INVENTORY).map((id) => rowFor(locale, id, rows.get(id), glossary));
}
/** Only explicit human approvals for the current English meaning reach a build. */
export async function readApprovedUiTranslations(locale: string): Promise<Record<string, string>> {
  const rows = await readUiTranslations(locale);
  return Object.fromEntries(rows.flatMap((row) => row.approved && row.approved.source === row.source && row.approved.context === row.context ? [[declared(row.id).catalogKey, row.approved.target]] : []));
}
export async function readUiTranslationHistory(locale: string, id: string) {
  resolveLocale(locale);
  declared(id);
  return readReviewHistory(locale, "ui", id);
}
function mutationOptions(localeCode: string, definition: ReturnType<typeof declared>, action: ReviewAction): ReviewMutationOptions {
  const locale = resolveLocale(localeCode);
  const compiledTarget = getCompiledUiCatalog(localeCode)[definition.catalogKey];
  return {
    // Baseline evidence belongs only in the first save history, never approval.
    seedDraft: action === "save" && compiledTarget !== undefined ? { source: definition.source, context: definition.context, target: compiledTarget, provenance: "compiled" } : null,
    onApprove: async (_tx, snapshot) => {
      // UI/catalog sources are plain text or Copy Studio Markdown, matching the
      // catalog compiler. Article VCode is handled by the segment pipeline.
      const result = validateSegment({ source: snapshot.source, target: snapshot.target, locale, markup: false });
      const defects = result.defects.filter((code) => BLOCKING_DEFECTS.includes(code));
      if (defects.length) throw new TranslationReviewError(`Translation validation failed: ${defects.join(", ")}.`);
    },
  };
}
export async function writeUiTranslation(input: Omit<ReviewMutation, "scope" | "sourceId" | "source" | "context"> & { id: string }): Promise<UiTranslationRow> {
  const definition = declared(input.id);
  resolveLocale(input.locale);
  // A correction that drops an approved term needs the reviewer's explicit exception.
  const glossaryExceptions = input.action === "save" && typeof input.target === "string"
    ? await assertCorrectionKeepsGlossary(input.locale, definition.source, input.target, input.glossaryExceptions)
    : [];
  const row = await mutateReviewEntry({ ...input, ...definition, glossaryExceptions, sourceId: input.id, scope: "ui" }, mutationOptions(input.locale, definition, input.action));
  return rowFor(input.locale, input.id, row, await readGlossaryMentionIndex(input.locale));
}
/** Draft the reviewed wording when it is not already the saved human draft, then approve that exact revision, in one transaction. */
async function approveReviewedLabel(locale: string, actor: string, item: UiBatchApprovalItem): Promise<UiTranslationRow> {
  const definition = declared(item.id);
  if (!isShortUiLabel(definition.source)) throw new TranslationReviewError("Review labels longer than three words one at a time.");
  const target = item.target.trim();
  if (!target) throw new TranslationReviewError("Enter a translation before approving.");
  const base = { locale, scope: "ui" as const, sourceId: item.id, source: definition.source, context: definition.context, actor, reason: UI_BATCH_APPROVAL_REASON };
  // The batch has no "Fine here" choice, so new wording must keep every approved term, as a single save does.
  const glossary = await readGlossaryMentionIndex(locale);
  const row = await getPostgresClient().sqlTransaction(async (tx) => {
    const current = await lockReviewEntry(tx, locale, "ui", item.id);
    if ((current?.revision ?? 0) !== item.expectedRevision) throw new TranslationReviewConflictError();
    const draft = current?.draft;
    const saved = draft && draft.provenance !== "compiled" && draft.source === definition.source && draft.context === definition.context && draft.target === target;
    if (!saved) assertKeepsGlossaryIn(glossary, definition.source, target);
    const revision = saved ? item.expectedRevision : (await mutateReviewEntryInTransaction(tx, { ...base, action: "save", target, expectedRevision: item.expectedRevision }, mutationOptions(locale, definition, "save"))).revision;
    return mutateReviewEntryInTransaction(tx, { ...base, action: "approve", expectedRevision: revision }, mutationOptions(locale, definition, "approve"));
  });
  return rowFor(locale, item.id, row);
}
/**
 * Approves each reviewer-selected label through the per-label draft and approval,
 * one transaction per label. A failed label leaves the others approved.
 */
export async function approveManyUiTranslations(input: { locale: string; actor: string; items: readonly UiBatchApprovalItem[] }): Promise<UiBatchApprovalResult[]> {
  resolveLocale(input.locale);
  // A frozen store refuses the whole batch instead of reporting every row.
  assertDataWritesNotFrozen("approveManyUiTranslations");
  const results: UiBatchApprovalResult[] = [];
  for (const item of input.items) {
    try {
      results.push({ id: item.id, ok: true, row: await approveReviewedLabel(input.locale, input.actor, item) });
    } catch (error) {
      if (error instanceof TranslationReviewError) results.push({ id: item.id, ok: false, code: error.code, error: error.message });
      else if (isDataWriteFrozenError(error)) results.push({ id: item.id, ok: false, code: error.code, error: "Translation writes are currently frozen." });
      else {
        console.error("Failed to approve UI label in batch:", item.id, error);
        results.push({ id: item.id, ok: false, code: "TRANSLATION_REVIEW_FAILED", error: "Unable to approve this label right now." });
      }
    }
  }
  return results;
}
