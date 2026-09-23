import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { getPublicDataReadAdapter } from "@server/data/publicData.reads";
import { getTranslationHashUsages } from "@server/translation/translationCoverage";
import { parseSegmentHistoryOptions, readTranslationSegmentHistory } from "@server/translation/segmentHistoryStore";
import { glossaryLocaleAccess, parseLocale } from "../translation-glossary/glossaryRoutes";
import { workbenchError } from "../translation-workbench/workbenchRoutes";
export const runtime = "nodejs";
export const maxDuration = 300;
export const GET = protectedRouteOperation({
  auth: "translator", rateLimit: "editorPolledRead", mapError: workbenchError,
  unexpectedErrorLabel: "Failed to read automatic translation history:",
  unexpectedErrorMessage: "Unable to load translation changes right now.",
  operation: async ({ request, auth }) => {
    const params = new URL(request.url).searchParams;
    const locale = parseLocale(params.get("locale"));
    const denied = glossaryLocaleAccess(auth, locale);
    if (denied) return denied;
    const options = parseSegmentHistoryOptions({ cursor: params.get("cursor"), hash: params.get("hash"), limit: params.get("limit") });
    getDataBackend();
    const history = await readTranslationSegmentHistory(locale, options);
    const usages = history.changes.length ? await getTranslationHashUsages(getPublicDataReadAdapter(), history.changes.map((change) => change.hash)) : {};
    return NextResponse.json({ ok: true, locale, ...history, changes: history.changes.map((change) => ({ ...change, pages: usages[change.hash]?.pages ?? [], pagesTotal: usages[change.hash]?.total ?? 0 })) });
  },
});
