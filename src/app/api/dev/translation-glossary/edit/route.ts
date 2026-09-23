import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { mutateGlossaryReview } from "@server/translation/glossaryReview";
import {
  GLOSSARY_BODY_MAX_BYTES,
  glossaryCollisionResponse,
  glossaryLocaleAccess,
  parseExpectedRevision,
  parseLocale,
  parseTarget,
  parseTerm,
} from "../glossaryRoutes";

export const runtime = "nodejs";

type EditBody = {
  locale?: unknown;
  term?: unknown;
  target?: unknown;
  expectedRevision?: unknown;
};
type ParsedEdit = {
  locale: string;
  term: string;
  target: string;
  expectedRevision: string;
};

export const POST = protectedRouteOperation<EditBody, ParsedEdit>({
  auth: "translator",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: GLOSSARY_BODY_MAX_BYTES,
    parse: (raw) => ({
      locale: parseLocale(raw.locale),
      term: parseTerm(raw.term),
      target: parseTarget(raw.target),
      expectedRevision: parseExpectedRevision(raw.expectedRevision),
    }),
  },
  mapError: glossaryCollisionResponse,
  unexpectedErrorLabel: "Failed to edit a glossary term via Next route:",
  unexpectedErrorMessage: "Unable to save that glossary term right now.",
  operation: async ({ actorEmail, body, auth }) => {
    getDataBackend();
    const denied = glossaryLocaleAccess(auth, body.locale);
    if (denied) return denied;
    const rows = await mutateGlossaryReview(
      body.locale,
      [
        {
          term: body.term,
          target: body.target,
          expectedRevision: body.expectedRevision,
          action: "save",
        },
      ],
      actorEmail,
    );
    const row = rows.find((entry) => entry.term === body.term);
    if (!row) {
      return NextResponse.json(
        {
          error: `No glossary row for "${body.term}" in ${body.locale}. Draft the missing terms first.`,
        },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, row });
  },
});
