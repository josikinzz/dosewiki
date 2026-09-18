/**
 * GET /api/dev/translation-glossary/export?locale=zh-Hans: every row for the
 * locale as `term,target,kind,status,gloss` CSV; the first four columns are
 * the shape /import takes back, the gloss rides along for reviewers.
 * Translator and up. The byte-order mark is for spreadsheets, which otherwise
 * guess the encoding and mangle the renderings.
 */
import { NextResponse } from "next/server";

import { glossaryToCsv } from "@/features/dev/tools/glossary/glossaryModel";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { readGlossaryRows } from "@server/translation/glossary";
import { loadGlosses } from "@server/translation/glossaryGloss";
import { glossaryLocaleAccess, parseLocale } from "../glossaryRoutes";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "translator",
  rateLimit: "editorPolledRead",
  unexpectedErrorLabel: "Failed to export the translation glossary via Next route:",
  unexpectedErrorMessage: "Unable to export the translation glossary right now.",
  operation: async ({ request, auth }) => {
    getDataBackend();
    const locale = parseLocale(new URL(request.url).searchParams.get("locale"));
    const denied = glossaryLocaleAccess(auth, locale);
    if (denied) return denied;
    const [rows, glosses] = await Promise.all([readGlossaryRows(locale), loadGlosses()]);
    return new NextResponse(glossaryToCsv(rows, glosses), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="glossary-${locale}.csv"`,
      },
    });
  },
});
