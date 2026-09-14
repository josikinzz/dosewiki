/**
 * POST /api/dev/translation-glossary/edit  { locale, term, target }
 *
 * Admin only. A reviewer's rendering for one term: the row becomes approved
 * and human-sourced on write, because writing it is the review. Refuses a
 * term the locale has no row for; terms enter through drafting.
 */
import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { editGlossaryTerm } from "@server/translation/glossary";
import { GLOSSARY_BODY_MAX_BYTES, glossaryUnavailable, parseLocale, parseTarget, parseTerm } from "../glossaryRoutes";

export const runtime = "nodejs";

type EditBody = { locale?: unknown; term?: unknown; target?: unknown };
type ParsedEdit = { locale: string; term: string; target: string };

export const POST = protectedRouteOperation<EditBody, ParsedEdit>({
  auth: "translator",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: GLOSSARY_BODY_MAX_BYTES,
    parse: (raw) => ({ locale: parseLocale(raw.locale), term: parseTerm(raw.term), target: parseTarget(raw.target) }),
  },
  unexpectedErrorLabel: "Failed to edit a glossary term via Next route:",
  unexpectedErrorMessage: "Unable to save that glossary term right now.",
  operation: async ({ actorEmail, body }) => {
    const unavailable = glossaryUnavailable();
    if (unavailable) return unavailable;
    const row = await editGlossaryTerm(body.locale, body.term, body.target, actorEmail);
    if (!row) {
      return NextResponse.json({ error: `No glossary row for "${body.term}" in ${body.locale}. Draft the missing terms first.` }, { status: 404 });
    }
    return NextResponse.json({ ok: true, row });
  },
});
