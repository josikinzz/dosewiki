import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { publicDataCache } from "@server/data/publicData.cache";
import { getPublicDataReadAdapter } from "@server/data/publicData.reads";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { readApprovedUiTranslations } from "@server/translation/uiTranslationStore";
import { getUiCatalogCoverage, type UiCatalogPublication } from "@server/translation/uiCatalogPublication";
import { UI_MESSAGE_INVENTORY } from "@server/translation/uiWorkbenchDefinitions";
import { getCompiledUiCatalog } from "@server/translation/uiCatalogs";
import publicationMetadata from "@/i18n/catalogPublication.json";
import { loadTranslationContext } from "@server/translation/liveTranslation";
import { translationQueueCoverage } from "@server/translation/segmentStore";
import { getTranslationCoverage } from "@server/translation/translationCoverage";
import { glossaryLocaleAccess, parseLocale } from "../translation-glossary/glossaryRoutes";

export const runtime = "nodejs";
export const maxDuration = 300;

const cachedCoverage = publicDataCache(
  async (locale: string, _promptVersion: string, _kinds: string) => getTranslationCoverage(getPublicDataReadAdapter(), await loadTranslationContext(locale)),
  ["dev-translation-coverage-v1"],
  { revalidate: 300 },
);

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
    const kinds = createHash("sha256").update(JSON.stringify(Object.entries(context.kinds).sort())).digest("hex").slice(0, 16);
    const [coverage, queue, approvedUi] = await Promise.all([
      cachedCoverage(locale, context.promptVersion, kinds),
      translationQueueCoverage(locale),
      readApprovedUiTranslations(locale),
    ]);
    const metadata = (publicationMetadata as Record<string, UiCatalogPublication>)[locale];
    return NextResponse.json({
      ...coverage,
      queue,
      catalogDigest: metadata?.catalogDigest ?? null,
      ui: getUiCatalogCoverage(locale, getCompiledUiCatalog(locale), approvedUi, metadata, UI_MESSAGE_INVENTORY, new Map(Object.entries(context.glossary))),
    }, { headers: { "Cache-Control": "private, no-store" } });
  },
});
