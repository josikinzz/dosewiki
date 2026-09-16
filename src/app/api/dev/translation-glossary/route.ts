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
import { getDataBackend } from "@server/postgres/runtime/backend";
import { glossaryLocales, pendingRetranslation, readGlossaryRows } from "@server/translation/glossary";
import { loadGlosses } from "@server/translation/glossaryGloss";
import { translationContextFromRows } from "@server/translation/liveTranslation";
import { translationSegmentCounts } from "@server/translation/segmentStore";
import { glossaryAccessibleLocales, glossaryLocaleAccess, parseLocale, type GlossaryListResponse, type GlossaryLocaleOption } from "./glossaryRoutes";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "translator",
  rateLimit: "editorPolledRead",
  unexpectedErrorLabel: "Failed to load the translation glossary via Next route:",
  unexpectedErrorMessage: "Unable to load the translation glossary right now.",
  operation: async ({ request, auth }) => {
    getDataBackend();

    const requested = new URL(request.url).searchParams.get("locale");
    const allowedLocales = glossaryAccessibleLocales(auth);
    if (allowedLocales.length === 0) return NextResponse.json({ error: "No glossary languages are approved for your account. Ask an admin to assign a language." }, { status: 403 });
    let locale: string;
    try {
      locale = parseLocale(requested ?? allowedLocales[0]);
    } catch (error) {
      if (error instanceof JsonBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
      throw error;
    }
    const denied = glossaryLocaleAccess(auth, locale);
    if (denied) return denied;

    const [summaries, rows, glosses] = await Promise.all([
      glossaryLocales(allowedLocales),
      readGlossaryRows(locale),
      loadGlosses(),
    ]);
    const context = translationContextFromRows(locale, rows, glosses);
    const segments = await translationSegmentCounts(locale, context.promptVersion);
    const liveCodes: readonly string[] = LIVE_LOCALE_CODES;
    const byLocale: Record<string, GlossaryLocaleOption> = {};
    for (const code of allowedLocales) byLocale[code] = { locale: code, draft: 0, approved: 0, live: liveCodes.includes(code) };
    for (const summary of summaries) if (allowedLocales.includes(summary.locale)) byLocale[summary.locale] = { ...summary, live: liveCodes.includes(summary.locale) };

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
