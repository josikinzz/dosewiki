/**
 * POST /api/dev/translation-glossary/confirm
 *   { locale, terms: string[], expectedRevisions, reason?, collisionConfirmation? }
 *
 * Translator and up. Confirms live wording nobody has checked, unchanged, at
 * the revision the reviewer saw: each term gains a human approval in review
 * history. The wording already reaches prompts and the public glossary, so a
 * confirmation changes no prompt digest and queues no retranslation.
 */
import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { isDataWriteFrozenError } from "@server/runtime/dataWriteFreeze";
import { confirmLegacyGlossaryRows } from "@server/translation/glossaryReview";
import {
  GLOSSARY_BODY_MAX_BYTES,
  glossaryCollisionResponse,
  glossaryLocaleAccess,
  glossaryRowPatch,
  parseCollisionConfirmation,
  parseExpectedRevisions,
  parseLocale,
  parseGlossaryReason,
  parseTerms,
} from "../glossaryRoutes";
import type { ReviewReason } from "@server/translation/reviewReason";

export const runtime = "nodejs";

const MAX_REASON_LENGTH = 500;

type ConfirmBody = {
  locale?: unknown;
  terms?: unknown;
  expectedRevisions?: unknown;
  reason?: unknown;
  collisionConfirmation?: unknown;
};
type ParsedConfirm = {
  locale: string;
  terms: string[];
  expectedRevisions: Record<string, string>;
  reason?: ReviewReason;
  collisionConfirmation?: string;
};

export const POST = protectedRouteOperation<ConfirmBody, ParsedConfirm>({
  auth: "translator",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: GLOSSARY_BODY_MAX_BYTES,
    parse: (raw) => {
      const terms = parseTerms(raw.terms);
      return {
        locale: parseLocale(raw.locale),
        terms,
        expectedRevisions: parseExpectedRevisions(raw.expectedRevisions, terms),
        reason: parseGlossaryReason(raw.reason, MAX_REASON_LENGTH),
        collisionConfirmation: parseCollisionConfirmation(raw.collisionConfirmation),
      };
    },
  },
  mapError: (error) =>
    isDataWriteFrozenError(error)
      ? NextResponse.json(
          { error: "Glossary writes are paused for maintenance. Nothing was confirmed.", code: error.code },
          { status: 503 },
        )
      : glossaryCollisionResponse(error),
  unexpectedErrorLabel: "Failed to confirm glossary terms via Next route:",
  unexpectedErrorMessage: "Unable to confirm those glossary terms right now.",
  operation: async ({ actorEmail, body, auth }) => {
    getDataBackend();
    const denied = glossaryLocaleAccess(auth, body.locale);
    if (denied) return denied;
    const rows = await confirmLegacyGlossaryRows(
      body.locale,
      body.terms.map((term) => ({ term, expectedRevision: body.expectedRevisions[term] })),
      actorEmail,
      { collisionConfirmation: body.collisionConfirmation, reason: body.reason },
    );
    return NextResponse.json({ ok: true, locale: body.locale, confirmed: body.terms, ...glossaryRowPatch(rows, body.terms) });
  },
});
