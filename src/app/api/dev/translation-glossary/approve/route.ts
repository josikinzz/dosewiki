/**
 * POST /api/dev/translation-glossary/approve  { locale, terms: string[] }
 *
 * Admin only. Marks the rows approved as they stand, stamped with the
 * reviewer. Approving changes the prompt digest, so the caller follows up
 * with /retranslate for the terms whose rendering changed.
 */
import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { approveGlossaryTerms } from "@server/translation/glossary";
import { GLOSSARY_BODY_MAX_BYTES, glossaryUnavailable, parseLocale, parseTerms } from "../glossaryRoutes";

export const runtime = "nodejs";

type ApproveBody = { locale?: unknown; terms?: unknown };
type ParsedApprove = { locale: string; terms: string[] };

export const POST = protectedRouteOperation<ApproveBody, ParsedApprove>({
  auth: "translator",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: GLOSSARY_BODY_MAX_BYTES, parse: (raw) => ({ locale: parseLocale(raw.locale), terms: parseTerms(raw.terms) }) },
  unexpectedErrorLabel: "Failed to approve glossary terms via Next route:",
  unexpectedErrorMessage: "Unable to approve those glossary terms right now.",
  operation: async ({ actorEmail, body }) => {
    const unavailable = glossaryUnavailable();
    if (unavailable) return unavailable;
    const approved = await approveGlossaryTerms(body.locale, body.terms, actorEmail);
    return NextResponse.json({ ok: true, locale: body.locale, approved });
  },
});
