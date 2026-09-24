/**
 * POST /api/dev/translation-fluency  { locale, slug }
 *
 * Admin only, for one substance article per request. A model reads the whole
 * article, English beside the wording readers see now, and proposes local
 * fluency edits. Each edit that passes the blocking validator and the glossary
 * conflict check becomes a Review Inbox suggestion; the rest are dropped and
 * counted. Nothing applies by itself. The response is the run summary: run id,
 * model, prompt version, token use, and counts.
 *
 * A second request for the same article while one runs is refused (409). The
 * write freeze fails closed (503) before any model request.
 */
import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { getPublicDataReadAdapter } from "@server/data/publicData.reads";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { runFluencyReview } from "@server/translation/fluencyReview";
import { glossaryLocaleAccess, parseLocale } from "../translation-glossary/glossaryRoutes";
import { workbenchError } from "../translation-workbench/workbenchRoutes";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = protectedRouteOperation<Record<string, unknown>, { locale: string; slug: string }>({
  auth: "admin",
  rateLimit: "editorHeavyWrite",
  body: {
    maxBytes: 4096,
    parse: (raw) => {
      if (!raw || typeof raw !== "object" || typeof raw.slug !== "string" || !raw.slug.trim() || raw.slug.length > 300)
        throw new JsonBodyError(400, "Choose a substance article to review.");
      return { locale: parseLocale(raw.locale), slug: raw.slug.trim() };
    },
  },
  mapError: workbenchError,
  unexpectedErrorLabel: "Fluency review failed",
  unexpectedErrorMessage: "Unable to run the fluency review right now.",
  operation: async ({ body, auth, actorEmail }) => {
    const denied = glossaryLocaleAccess(auth, body.locale);
    if (denied) return denied;
    getDataBackend();
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Missing OPENROUTER_API_KEY on the server." }, { status: 503 });
    const run = await runFluencyReview({ reads: getPublicDataReadAdapter(), locale: body.locale, slug: body.slug, apiKey, actor: actorEmail });
    return NextResponse.json({ ok: true, run });
  },
});
