/**
 * POST /api/dev/translation-glossary/approve  { locale, terms: string[], reason?, collisionConfirmation? }
 *
 * Translator and up. Marks the rows approved as they stand, stamped with the
 * reviewer. `reason` is `{ kind, note }` and joins each term's review history. Approving changes the prompt digest, so the caller follows up
 * with /retranslate for the terms whose rendering changed.
 */
import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { mutateGlossaryReview } from "@server/translation/glossaryReview";
import {
  GLOSSARY_BODY_MAX_BYTES,
  glossaryCollisionResponse,
  glossaryLocaleAccess,
  parseCollisionConfirmation,
  parseLocale,
  parseTerms,
  parseExpectedRevisions,
  parseGlossaryReason,
} from "../glossaryRoutes";
import type { ReviewReason } from "@server/translation/reviewReason";

export const runtime = "nodejs";

type ApproveBody = {
  locale?: unknown;
  terms?: unknown;
  expectedRevisions?: unknown;
  reason?: unknown;
  collisionConfirmation?: unknown;
};
type ParsedApprove = {
  locale: string;
  terms: string[];
  expectedRevisions: Record<string, string>;
  reason?: ReviewReason;
  collisionConfirmation?: string;
};

export const POST = protectedRouteOperation<ApproveBody, ParsedApprove>({
  auth: "translator",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: GLOSSARY_BODY_MAX_BYTES,
    parse: (raw) => ({
      locale: parseLocale(raw.locale),
      terms: parseTerms(raw.terms),
      expectedRevisions: parseExpectedRevisions(
        raw.expectedRevisions,
        parseTerms(raw.terms),
      ),
      reason: parseGlossaryReason(raw.reason),
      collisionConfirmation: parseCollisionConfirmation(
        raw.collisionConfirmation,
      ),
    }),
  },
  mapError: glossaryCollisionResponse,
  unexpectedErrorLabel: "Failed to approve glossary terms via Next route:",
  unexpectedErrorMessage: "Unable to approve those glossary terms right now.",
  operation: async ({ actorEmail, body, auth }) => {
    getDataBackend();
    const denied = glossaryLocaleAccess(auth, body.locale);
    if (denied) return denied;
    await mutateGlossaryReview(
      body.locale,
      body.terms.map((term) => ({
        term,
        action: "approve" as const,
        expectedRevision: body.expectedRevisions[term],
      })),
      actorEmail,
      body.collisionConfirmation,
      body.reason,
    );
    const approved = body.terms;
    return NextResponse.json({ ok: true, locale: body.locale, approved });
  },
});
