import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { requeueExhaustedTranslationJobs, translationJobCounts } from "@server/translation/segmentStore";
import { GLOSSARY_BODY_MAX_BYTES, glossaryLocaleAccess, parseLocale } from "../glossaryRoutes";

export const runtime = "nodejs";
export const maxDuration = 60;

type RetryExhaustedBody = { locale?: unknown };
type ParsedRetryExhausted = { locale: string };

export type RetryExhaustedResponse = { ok: true; status: "queued"; locale: string; runId: string | null; requeued: number };

export const POST = protectedRouteOperation<RetryExhaustedBody, ParsedRetryExhausted>({
  auth: "admin",
  rateLimit: "editorHeavyWrite",
  body: { maxBytes: GLOSSARY_BODY_MAX_BYTES, parse: (raw) => ({ locale: parseLocale(raw.locale) }) },
  unexpectedErrorLabel: "Failed to retry exhausted translation jobs via Next route:",
  unexpectedErrorMessage: "Unable to retry the failed pages right now.",
  operation: async ({ body, auth }) => {
    getDataBackend();
    const denied = glossaryLocaleAccess(auth, body.locale);
    if (denied) return denied;

    const { runId } = await translationJobCounts(body.locale);
    const requeued = runId ? await requeueExhaustedTranslationJobs(body.locale, runId) : [];
    const response: RetryExhaustedResponse = { ok: true, status: "queued", locale: body.locale, runId, requeued: requeued.length };
    return NextResponse.json(response);
  },
});
