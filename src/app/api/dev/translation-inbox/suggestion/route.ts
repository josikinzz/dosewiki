/**
 * POST /api/dev/translation-inbox/suggestion  { locale, id, expectedRevision }
 *
 * Translator and up, for an assigned locale only. Accept on a model fluency
 * suggestion: saves the suggested sentence as a narrative draft with reason
 * Fluency and marks the suggestion resolved, in one transaction. It never
 * approves; the draft waits in Pages like any correction. A changed revision,
 * an expired suggestion, or an open correction draft is refused (409) and
 * writes nothing; the write freeze fails closed (503).
 */
import { NextResponse } from "next/server";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { getPublicDataReadAdapter } from "@server/data/publicData.reads";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { acceptModelSuggestion } from "@server/translation/fluencyReview";
import { glossaryLocaleAccess, parseLocale } from "../../translation-glossary/glossaryRoutes";
import { workbenchError } from "../../translation-workbench/workbenchRoutes";

export const runtime = "nodejs";

type Body = { locale: string; id: string; expectedRevision: number };

export const POST = protectedRouteOperation<Record<string, unknown>, Body>({
  auth: "translator",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 4096,
    parse: (raw) => {
      if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !/^\w{64}:[a-f0-9]{16}$/.test(raw.id))
        throw new JsonBodyError(400, "Choose a model suggestion to accept.");
      if (!Number.isSafeInteger(raw.expectedRevision) || Number(raw.expectedRevision) < 1) throw new JsonBodyError(400, "An expected revision is required.");
      return { locale: parseLocale(raw.locale), id: raw.id, expectedRevision: Number(raw.expectedRevision) };
    },
  },
  mapError: workbenchError,
  unexpectedErrorLabel: "Accepting a model suggestion failed",
  unexpectedErrorMessage: "Unable to accept that suggestion right now.",
  operation: async ({ body, auth, actorEmail }) => {
    const denied = glossaryLocaleAccess(auth, body.locale);
    if (denied) return denied;
    getDataBackend();
    const { narrative, suggestion } = await acceptModelSuggestion(getPublicDataReadAdapter(), { ...body, actor: actorEmail });
    return NextResponse.json({ ok: true, entry: narrative, suggestion });
  },
});
