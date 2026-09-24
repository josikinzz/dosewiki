/**
 * GET /api/dev/translation-glossary?locale=zh-Hans: every glossary row for one
 * locale plus the locale picker (live mirrors and any locale with rows), the
 * prompt digest the approved set and approved style guide produce, and the locale-independent glosses.
 * Translator and up.
 */
import { NextResponse } from "next/server";

import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { LIVE_LOCALE_CODES } from "@server/next/localeHostPolicy";
import { getDataBackend } from "@server/postgres/runtime/backend";
import {
  glossaryLocales,
  pendingRetranslation,
  readGlossaryRows,
} from "@server/translation/glossary";
import { readGlossaryReviewRows } from "@server/translation/glossaryReview";
import { loadGlosses } from "@server/translation/glossaryGloss";
import { loadApprovedStyleGuide } from "@server/translation/approvedStyleGuide";
import { translationContextFromRows } from "@server/translation/liveTranslation";
import { translationJobCounts, translationSegmentCounts } from "@server/translation/segmentStore";
import { getGlossaryUsages } from "@server/translation/glossaryUsage";
import { glossaryAccessibleLocales, glossaryLocaleAccess, parseLocale, type GlossaryListResponse, type GlossaryLocaleOption } from "./glossaryRoutes";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "translator",
  rateLimit: "editorPolledRead",
  unexpectedErrorLabel:
    "Failed to load the translation glossary via Next route:",
  unexpectedErrorMessage: "Unable to load the translation glossary right now.",
  operation: async ({ request, auth }) => {
    getDataBackend();

    const searchParams = new URL(request.url).searchParams;
    const requested = searchParams.get("locale");
    const includeUsage = searchParams.get("includeUsage") !== "0";
    const allowedLocales = glossaryAccessibleLocales(auth);
    if (allowedLocales.length === 0)
      return NextResponse.json(
        {
          error:
            "No glossary languages are approved for your account. Ask an admin to assign a language.",
        },
        { status: 403 },
      );
    let locale: string;
    try {
      locale = parseLocale(requested ?? allowedLocales[0]);
    } catch (error) {
      if (error instanceof JsonBodyError)
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      throw error;
    }
    const denied = glossaryLocaleAccess(auth, locale);
    if (denied) return denied;

    const [summaries, rows, glosses, styleGuide] = await Promise.all([
      glossaryLocales(allowedLocales),
      readGlossaryRows(locale),
      loadGlosses(),
      loadApprovedStyleGuide(locale),
    ]);
    const context = translationContextFromRows(locale, rows, glosses, styleGuide);
    const [segments, jobs] = await Promise.all([
      translationSegmentCounts(locale, context.promptVersion),
      translationJobCounts(locale),
    ]);
    const liveCodes: readonly string[] = LIVE_LOCALE_CODES;
    const byLocale: Record<string, GlossaryLocaleOption> = {};
    for (const code of allowedLocales)
      byLocale[code] = {
        locale: code,
        draft: 0,
        approved: 0,
        live: liveCodes.includes(code),
      };
    for (const summary of summaries)
      if (allowedLocales.includes(summary.locale))
        byLocale[summary.locale] = {
          ...summary,
          live: liveCodes.includes(summary.locale),
        };

    const reviewRows = await readGlossaryReviewRows(locale, rows);
    const body: GlossaryListResponse = {
      ok: true,
      generatedAt: Date.now(),
      locale,
      promptVersion: context.promptVersion,
      segments,
      jobs,
      locales: Object.values(byLocale).sort((a, b) => a.locale.localeCompare(b.locale)),
      rows: reviewRows,
      usages: includeUsage ? await getGlossaryUsages(reviewRows.map((row) => row.term)) : undefined,
      pending: pendingRetranslation(rows),
      glosses: context.glosses,
    };
    return NextResponse.json(body);
  },
});
