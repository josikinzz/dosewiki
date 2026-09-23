import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { readReviewHistory } from "@server/translation/reviewStore";
import { mutateGlossaryReview } from "@server/translation/glossaryReview";
import {
  GLOSSARY_BODY_MAX_BYTES,
  glossaryCollisionResponse,
  glossaryLocaleAccess,
  parseExpectedRevision,
  parseLocale,
  parseTerm,
} from "../glossaryRoutes";
export const runtime = "nodejs";
export const GET = protectedRouteOperation({
  auth: "translator",
  rateLimit: "editorPolledRead",
  mapError: glossaryCollisionResponse,
  unexpectedErrorLabel: "Glossary history read failed:",
  unexpectedErrorMessage: "Unable to load glossary history.",
  operation: async ({ request, auth }) => {
    const params = new URL(request.url).searchParams;
    const locale = parseLocale(params.get("locale"));
    const denied = glossaryLocaleAccess(auth, locale);
    if (denied) return denied;
    return NextResponse.json({
      ok: true,
      history: await readReviewHistory(
        locale,
        "glossary",
        parseTerm(params.get("term")),
      ),
    });
  },
});
export const POST = protectedRouteOperation({
  auth: "translator",
  rateLimit: "editorSmallWrite",
  mapError: glossaryCollisionResponse,
  body: {
    maxBytes: GLOSSARY_BODY_MAX_BYTES,
    parse: (raw: {
      locale?: unknown;
      term?: unknown;
      expectedRevision?: unknown;
      restoreRevision?: unknown;
    }) => {
      if (
        typeof raw.restoreRevision !== "number" ||
        !Number.isSafeInteger(raw.restoreRevision) ||
        raw.restoreRevision < 1
      )
        throw new JsonBodyError(
          400,
          "Select a historical revision to restore.",
        );
      return {
        locale: parseLocale(raw.locale),
        term: parseTerm(raw.term),
        expectedRevision: parseExpectedRevision(raw.expectedRevision),
        restoreRevision: raw.restoreRevision,
      };
    },
  },
  unexpectedErrorLabel: "Glossary restore failed:",
  unexpectedErrorMessage: "Unable to restore that draft.",
  operation: async ({ body, auth, actorEmail }) => {
    const denied = glossaryLocaleAccess(auth, body.locale);
    if (denied) return denied;
    const rows = await mutateGlossaryReview(
      body.locale,
      [{ ...body, action: "restore" }],
      actorEmail,
      undefined,
      "Restore historical rendering as draft",
    );
    return NextResponse.json({
      ok: true,
      row: rows.find((row) => row.term === body.term),
    });
  },
});
