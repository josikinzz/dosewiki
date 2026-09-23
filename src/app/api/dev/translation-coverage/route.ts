import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { getPublicDataReadAdapter } from "@server/data/publicData.reads";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { readApprovedUiTranslations } from "@server/translation/uiTranslationStore";
import { getUiCatalogCoverage, type UiCatalogPublication } from "@server/translation/uiCatalogPublication";
import { UI_MESSAGE_INVENTORY } from "@server/translation/uiWorkbenchDefinitions";
import { getCompiledUiCatalog } from "@server/translation/uiCatalogs";
import publicationMetadata from "@/i18n/catalogPublication.json";
import { loadTranslationContext } from "@server/translation/liveTranslation";
import { getTranslationCoverage } from "@server/translation/translationCoverage";
import { glossaryLocaleAccess, parseLocale } from "../translation-glossary/glossaryRoutes";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Explicit, read-only audit. Source inventory is cached five minutes, never polled while typing. */
export const GET = protectedRouteOperation({
  auth: "translator",
  rateLimit: "editorPolledRead",
  unexpectedErrorLabel: "Failed to inspect translation coverage:",
  unexpectedErrorMessage: "Unable to inspect translation coverage right now.",
  operation: async ({ request, auth }) => {
    getDataBackend();
    let locale: string;
    try { locale = parseLocale(new URL(request.url).searchParams.get("locale")); }
    catch (error) {
      if (error instanceof JsonBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
      throw error;
    }
    const denied = glossaryLocaleAccess(auth, locale);
    if (denied) return denied;
    const context = await loadTranslationContext(locale);
    const coverage = await getTranslationCoverage(getPublicDataReadAdapter(), context);
    const approvedUi = await readApprovedUiTranslations(locale);
    const metadata = (publicationMetadata as Record<string, UiCatalogPublication>)[locale];
    coverage.catalogDigest = metadata?.catalogDigest ?? null;
    coverage.ui = getUiCatalogCoverage(locale, getCompiledUiCatalog(locale), approvedUi, metadata, UI_MESSAGE_INVENTORY, new Map(Object.entries(context.glossary)));
    return NextResponse.json(coverage, { headers: { "Cache-Control": "private, no-store" } });
  },
});
