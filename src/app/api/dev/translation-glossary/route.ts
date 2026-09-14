/**
 * GET /api/dev/translation-glossary?locale=zh-Hans: every glossary row for one
 * locale plus the locale picker (live mirrors and any locale with rows), the
 * prompt digest the approved set produces, and the locale-independent glosses.
 * Translator and up.
 */
import { NextResponse } from "next/server";

import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { LIVE_LOCALE_CODES } from "@server/next/localeHostPolicy";
import { glossaryLocales, pendingRetranslation, readGlossaryRows } from "@server/translation/glossary";
import { loadTranslationContext } from "@server/translation/liveTranslation";
import { translationSegmentCounts } from "@server/translation/segmentStore";
import { glossaryUnavailable, parseLocale, type GlossaryListResponse, type GlossaryLocaleOption } from "./glossaryRoutes";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "translator",
  rateLimit: "editorPolledRead",
  unexpectedErrorLabel: "Failed to load the translation glossary via Next route:",
  unexpectedErrorMessage: "Unable to load the translation glossary right now.",
  operation: async ({ request }) => {
    const unavailable = glossaryUnavailable();
    if (unavailable) return unavailable;

    const requested = new URL(request.url).searchParams.get("locale");
    let locale: string;
    try {
      locale = parseLocale(requested ?? LIVE_LOCALE_CODES[0]);
    } catch (error) {
      if (error instanceof JsonBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
      throw error;
    }

    const [summaries, rows, context] = await Promise.all([glossaryLocales(), readGlossaryRows(locale), loadTranslationContext(locale)]);
    const segments = await translationSegmentCounts(locale, context.promptVersion);
    const liveCodes: readonly string[] = LIVE_LOCALE_CODES;
    const byLocale: Record<string, GlossaryLocaleOption> = {};
    for (const code of liveCodes) byLocale[code] = { locale: code, draft: 0, approved: 0, live: true };
    for (const summary of summaries) byLocale[summary.locale] = { ...summary, live: liveCodes.includes(summary.locale) };

    const body: GlossaryListResponse = {
      ok: true,
      locale,
      promptVersion: context.promptVersion,
      segments,
      locales: Object.values(byLocale).sort((a, b) => a.locale.localeCompare(b.locale)),
      rows,
      pending: pendingRetranslation(rows),
      glosses: context.glosses,
    };
    return NextResponse.json(body);
  },
});
