/**
 * POST /api/dev/translation-glossary/gloss  { term, gloss }
 *
 * Editor and up: a gloss is English taxonomy content, so translators read
 * it and editors write it. One definition per term, shared by every locale.
 * The term's kind (and stored spelling) comes from its existing gloss row,
 * else from the known-term set (the site's term universe plus every term a
 * locale's glossary already holds); anything else is refused, since a gloss
 * for a term no prompt injects would never be read.
 */
import { NextResponse } from "next/server";

import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { getPublicDataReadAdapter } from "@server/data/publicData.reads";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { GLOSS_MAX_LENGTH, GlossaryGlossError, findGloss, knownGlossaryTerms, upsertGlosses } from "@server/translation/glossaryGloss";
import { GLOSSARY_BODY_MAX_BYTES, parseTerm } from "../glossaryRoutes";

export const runtime = "nodejs";

type GlossBody = { term?: unknown; gloss?: unknown };
type ParsedGloss = { term: string; gloss: string };

function parseGloss(raw: unknown): string {
  const gloss = typeof raw === "string" ? raw.trim() : "";
  if (!gloss || gloss.length > GLOSS_MAX_LENGTH) {
    throw new JsonBodyError(400, `A one-line gloss of at most ${GLOSS_MAX_LENGTH} characters is required.`);
  }
  return gloss;
}

export const POST = protectedRouteOperation<GlossBody, ParsedGloss>({
  auth: "editor",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: GLOSSARY_BODY_MAX_BYTES,
    parse: (raw) => ({ term: parseTerm(raw.term), gloss: parseGloss(raw.gloss) }),
  },
  unexpectedErrorLabel: "Failed to save a glossary gloss via Next route:",
  unexpectedErrorMessage: "Unable to save that gloss right now.",
  mapError: (error) => (error instanceof GlossaryGlossError ? NextResponse.json({ error: error.message }, { status: 400 }) : null),
  operation: async ({ actorEmail, body }) => {
    getDataBackend();

    const existing = await findGloss(body.term);
    const wanted = body.term.toLowerCase();
    const known = existing ?? (await knownGlossaryTerms(getPublicDataReadAdapter())).find((entry) => entry.term.toLowerCase() === wanted);
    if (!known) {
      return NextResponse.json({ error: `"${body.term}" is not a glossary term; only terms the site publishes or a locale's glossary holds take a gloss.` }, { status: 404 });
    }

    await upsertGlosses([{ term: known.term, kind: known.kind, gloss: body.gloss }], actorEmail);
    const row = await findGloss(known.term);
    if (!row) throw new Error(`The gloss for "${known.term}" was written but did not read back.`);
    return NextResponse.json({ ok: true, row });
  },
});
