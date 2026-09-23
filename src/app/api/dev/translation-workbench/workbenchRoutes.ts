import { NextResponse } from "next/server";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { TranslationReviewError } from "@server/translation/reviewStore";
import { isDataWriteFrozenError } from "@server/runtime/dataWriteFreeze";
import { getUiMessageInventoryDefinition } from "@server/translation/uiWorkbenchDefinitions";
import { parseLocale } from "../translation-glossary/glossaryRoutes";
import type { ReviewAction } from "@server/translation/reviewTypes";

export function parseMessageId(value: unknown): string {
  if (typeof value !== "string" || !getUiMessageInventoryDefinition(value)) throw new JsonBodyError(400, "Choose a declared UI message.");
  return value;
}
export function workbenchError(error: unknown): NextResponse | null {
  if (isDataWriteFrozenError(error)) return NextResponse.json({ error: "Translation writes are currently frozen.", code: error.code }, { status: 503 });
  if (error instanceof TranslationReviewError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  return null;
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
