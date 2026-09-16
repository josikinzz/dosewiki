/**
 * POST /api/dev/translation-glossary/draft  { locale }
 *
 * Admin only. Drafts every term the locale has no row for, by the model, as
 * draft rows for review: the same routine as `build-glossary.mjs --locale`.
 * About 400 terms in forty-term batches is under a minute; the function
 * budget is generous because a cold locale drafts the whole universe.
 */
import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { getPublicDataReadAdapter } from "@server/data/publicData.reads";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { draftGlossary } from "@server/translation/glossaryDraft";
import { GLOSSARY_BODY_MAX_BYTES, glossaryLocaleAccess, parseLocale } from "../glossaryRoutes";

export const runtime = "nodejs";
export const maxDuration = 300;

type DraftBody = { locale?: unknown };
type ParsedDraft = { locale: string };

export const POST = protectedRouteOperation<DraftBody, ParsedDraft>({
  auth: "admin",
  rateLimit: "editorHeavyWrite",
  body: { maxBytes: GLOSSARY_BODY_MAX_BYTES, parse: (raw) => ({ locale: parseLocale(raw.locale) }) },
  unexpectedErrorLabel: "Failed to draft glossary terms via Next route:",
  unexpectedErrorMessage: "Unable to draft glossary terms right now.",
  operation: async ({ body, auth }) => {
    getDataBackend();
    const denied = glossaryLocaleAccess(auth, body.locale);
    if (denied) return denied;
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENROUTER_API_KEY on the server; draft from a workstation with build-glossary.mjs." }, { status: 503 });
    }
    const report = await draftGlossary({ locale: body.locale, reads: getPublicDataReadAdapter(), apiKey });
    return NextResponse.json({ ok: true, ...report });
  },
});
