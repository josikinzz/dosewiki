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
import {
  glossaryAccessibleLocales,
  glossaryLocaleAccess,
  parseLocale,
  parsePromptVersion,
  type GlossaryListResponse,
  type GlossaryLocaleOption,
  type GlossaryProgressResponse,
} from "./glossaryRoutes";

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
    const includeUsage = searchParams.get("includeUsage") === "1";
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
    let progressVersion: string | null = null;
    try {
      locale = parseLocale(requested ?? allowedLocales[0]);
      if (searchParams.get("progress") === "1")
        progressVersion = parsePromptVersion(searchParams.get("promptVersion"));
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

    if (progressVersion !== null) {
      const [segments, jobs] = await Promise.all([
        translationSegmentCounts(locale, progressVersion),
        translationJobCounts(locale),
      ]);
      const progress: GlossaryProgressResponse = {
        ok: true,
        generatedAt: Date.now(),
        locale,
        promptVersion: progressVersion,
        segments,
        jobs,
      };
      return NextResponse.json(progress);
    }

    const [summaries, rows, glosses, styleGuide] = await Promise.all([
      glossaryLocales(allowedLocales),
      readGlossaryRows(locale),
      loadGlosses(),
      loadApprovedStyleGuide(locale),
    ]);
    const context = translationContextFromRows(locale, rows, glosses, styleGuide);
    const [segments, jobs, reviewRows] = await Promise.all([
      translationSegmentCounts(locale, context.promptVersion),
      translationJobCounts(locale),
      readGlossaryReviewRows(locale, rows),
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
