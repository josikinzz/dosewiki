import { NextResponse } from "next/server";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { TranslationReviewError } from "@server/translation/reviewStore";
import { isDataWriteFrozenError } from "@server/runtime/dataWriteFreeze";
import { getUiMessageInventoryDefinition } from "@server/translation/uiWorkbenchDefinitions";
import { parseLocale } from "../translation-glossary/glossaryRoutes";
import type { ReviewAction } from "@server/translation/reviewTypes";
import { UI_BATCH_MAX_ITEMS, type UiBatchApprovalItem } from "@server/translation/uiTranslationTypes";

export function parseMessageId(value: unknown): string {
  if (typeof value !== "string" || !getUiMessageInventoryDefinition(value)) throw new JsonBodyError(400, "Choose a declared UI message.");
  return value;
}
export function workbenchError(error: unknown): NextResponse | null {
  if (isDataWriteFrozenError(error)) return NextResponse.json({ error: "Translation writes are currently frozen.", code: error.code }, { status: 503 });
  if (error instanceof TranslationReviewError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  return null;
}
/** Each item is one label the reviewer ticked, with the revision and wording they saw. */
export function parseBatchApproval(raw: Record<string, unknown>): { locale: string; items: UiBatchApprovalItem[] } {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.items) || !raw.items.length || raw.items.length > UI_BATCH_MAX_ITEMS) throw new JsonBodyError(400, `Choose between 1 and ${UI_BATCH_MAX_ITEMS} labels to approve.`);
  const seen = new Set<string>();
  const items = raw.items.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new JsonBodyError(400, "Each selected label needs an id, revision, and translation.");
    const { id: rawId, expectedRevision, target } = item as Record<string, unknown>;
    const id = parseMessageId(rawId);
    if (seen.has(id)) throw new JsonBodyError(400, "Each label can appear once in a batch.");
    seen.add(id);
    if (!Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 0) throw new JsonBodyError(400, "An expected revision is required.");
    if (typeof target !== "string" || !target.trim() || target.length > 2000) throw new JsonBodyError(400, "Enter a translation of up to 2000 characters.");
    return { id, expectedRevision: expectedRevision as number, target: target.trim() };
  });
  return { locale: parseLocale(raw.locale), items };
}
export function parseWorkbenchMutation(raw: Record<string, unknown>) {
  if (!raw || typeof raw !== "object") throw new JsonBodyError(400, "A translation change is required.");
  const action = raw.action as ReviewAction;
  if (!["save", "approve", "restore"].includes(action)) throw new JsonBodyError(400, "Choose save, approve, or restore.");
  if (!Number.isSafeInteger(raw.expectedRevision) || Number(raw.expectedRevision) < 0) throw new JsonBodyError(400, "An expected revision is required.");
  if (typeof raw.reason !== "string" || !raw.reason.trim() || raw.reason.length > 1000) throw new JsonBodyError(400, "Explain this change in up to 1000 characters.");
  if (action === "save" && (typeof raw.target !== "string" || !raw.target.trim() || raw.target.length > 2000)) throw new JsonBodyError(400, "Enter a translation of up to 2000 characters.");
  if (action === "restore" && (!Number.isSafeInteger(raw.restoreRevision) || Number(raw.restoreRevision) < 0)) throw new JsonBodyError(400, "Choose a valid revision to restore.");
  return { locale: parseLocale(raw.locale), id: parseMessageId(raw.id), action, expectedRevision: raw.expectedRevision as number, reason: raw.reason.trim(), target: typeof raw.target === "string" ? raw.target : undefined, restoreRevision: raw.restoreRevision as number | undefined };
}
