/**
 * POST /api/dev/translation-glossary/edit  { locale, term, target, collisionConfirmation? }
 *
 * Translator and up. A reviewer's rendering for one term: the row becomes approved
 * and human-sourced on write, because writing it is the review. Refuses a
 * term the locale has no row for; terms enter through drafting.
 */
import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { editGlossaryTerm } from "@server/translation/glossary";
import { GLOSSARY_BODY_MAX_BYTES, glossaryCollisionResponse, glossaryLocaleAccess, parseCollisionConfirmation, parseLocale, parseTarget, parseTerm } from "../glossaryRoutes";

export const runtime = "nodejs";

type EditBody = { locale?: unknown; term?: unknown; target?: unknown; collisionConfirmation?: unknown };
type ParsedEdit = { locale: string; term: string; target: string; collisionConfirmation?: string };

export const POST = protectedRouteOperation<EditBody, ParsedEdit>({
  auth: "translator",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: GLOSSARY_BODY_MAX_BYTES,
    parse: (raw) => ({ locale: parseLocale(raw.locale), term: parseTerm(raw.term), target: parseTarget(raw.target), collisionConfirmation: parseCollisionConfirmation(raw.collisionConfirmation) }),
  },
  mapError: glossaryCollisionResponse,
  unexpectedErrorLabel: "Failed to edit a glossary term via Next route:",
  unexpectedErrorMessage: "Unable to save that glossary term right now.",
  operation: async ({ actorEmail, body, auth }) => {
    getDataBackend();
    const denied = glossaryLocaleAccess(auth, body.locale);
    if (denied) return denied;
    const row = await editGlossaryTerm(body.locale, body.term, body.target, actorEmail, body.collisionConfirmation);
    if (!row) {
      return NextResponse.json({ error: `No glossary row for "${body.term}" in ${body.locale}. Draft the missing terms first.` }, { status: 404 });
    }
    return NextResponse.json({ ok: true, row });
  },
});
