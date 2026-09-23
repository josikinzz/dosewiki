import "server-only";
import { getUiMessageInventoryDefinition, UI_MESSAGE_INVENTORY } from "./uiWorkbenchDefinitions";
import { resolveLocale } from "../../scripts/translation/locales.mjs";
import { BLOCKING_DEFECTS, validateSegment } from "../../scripts/translation/validate.mjs";
import { mutateReviewEntry, readReviewEntries, readReviewHistory, TranslationReviewError } from "./reviewStore";
import type { ReviewEntry, ReviewMutation } from "./reviewTypes";
import { getCompiledUiCatalog } from "./uiCatalogs";
import type { UiTranslationRow } from "./uiTranslationTypes";

function declared(id: string) {
  const definition = getUiMessageInventoryDefinition(id);
  if (!definition) throw new TranslationReviewError("Unknown UI message. Only declared messages can be edited.");
  return definition;
}
function rowFor(locale: string, id: string, entry?: ReviewEntry): UiTranslationRow {
  const definition = declared(id);
  const compiledTarget = getCompiledUiCatalog(locale)[definition.catalogKey] ?? null;
  const approved = entry?.approved ?? null;
  const draft = entry?.draft ?? null;
  const active = draft ?? approved;
  return { id, ...definition, compiledTarget, revision: entry?.revision ?? 0, draft, approved, updatedAt: entry?.updatedAt ?? null,
    status: active && (active.source !== definition.source || active.context !== definition.context) ? "stale" : draft ? "draft" : approved ? "approved" : compiledTarget !== null ? "unreviewed" : "missing" };
}
export async function readUiTranslations(locale: string): Promise<UiTranslationRow[]> {
  resolveLocale(locale);
  const rows = new Map((await readReviewEntries(locale, "ui")).map((row) => [row.sourceId, row]));
  return Object.keys(UI_MESSAGE_INVENTORY).map((id) => rowFor(locale, id, rows.get(id)));
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
export async function writeUiTranslation(input: Omit<ReviewMutation, "scope" | "sourceId" | "source" | "context"> & { id: string }): Promise<UiTranslationRow> {
  const definition = declared(input.id);
  const locale = resolveLocale(input.locale);
  const compiledTarget = getCompiledUiCatalog(input.locale)[definition.catalogKey];
  const row = await mutateReviewEntry({ ...input, ...definition, sourceId: input.id, scope: "ui" }, {
    // Baseline evidence belongs only in the first save history, never approval.
    seedDraft: input.action === "save" && compiledTarget !== undefined ? { source: definition.source, context: definition.context, target: compiledTarget, provenance: "compiled" } : null,
    onApprove: async (_tx, snapshot) => {
      // UI/catalog sources are plain text or Copy Studio Markdown, matching the
      // catalog compiler. Article VCode is handled by the segment pipeline.
      const result = validateSegment({ source: snapshot.source, target: snapshot.target, locale, markup: false });
      const defects = result.defects.filter((code) => BLOCKING_DEFECTS.includes(code));
      if (defects.length) throw new TranslationReviewError(`Translation validation failed: ${defects.join(", ")}.`);
    },
  });
  return rowFor(input.locale, input.id, row);
}
