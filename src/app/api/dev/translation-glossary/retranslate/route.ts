/**
 * POST /api/dev/translation-glossary/retranslate  { locale, terms: string[] }
 *
 * Admin only. The scoped stale replay after a glossary edit, through the job
 * outbox instead of a workstation: stored segments whose English mentions a
 * term are marked stale and every public record mentioning a term is enqueued.
 * Other old digests remain stale until actually refreshed. Submission records
 * a request timestamp only; the coverage audit checks stored outcomes.
 *
 * Reads the whole corpus to find those records, like `live-mirror.ts stale`.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { getPublicDataReadAdapter } from "@server/data/publicData.reads";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { markRetranslationRequested } from "@server/translation/glossary";
import { loadTranslationContext, recordsMentioning, translationJobSlug, type TranslationRecordKind } from "@server/translation/liveTranslation";
import { enqueueTranslationJobs, readTranslationsMentioning, scopeStaleTranslations } from "@server/translation/segmentStore";
import { GLOSSARY_BODY_MAX_BYTES, glossaryLocaleAccess, parseLocale, parseTerms } from "../glossaryRoutes";

export const runtime = "nodejs";
export const maxDuration = 300;

type RetranslateBody = { locale?: unknown; terms?: unknown };
type ParsedRetranslate = { locale: string; terms: string[] };

export type RetranslateResponse = {
  ok: true;
  status: "queued";
  requestedAt: number;
  locale: string;
  terms: string[];
  promptVersion: string;
  /** Stored segments mentioning a term, now marked stale. */
  segments: number;
  /** Always zero: unrelated old digests are not proven current. */
  restamped: number;
  runId: string;
  /** Records enqueued, by kind. */
  jobs: Partial<Record<TranslationRecordKind, number>>;
};

export const POST = protectedRouteOperation<RetranslateBody, ParsedRetranslate>({
  auth: "admin",
  rateLimit: "editorHeavyWrite",
  body: { maxBytes: GLOSSARY_BODY_MAX_BYTES, parse: (raw) => ({ locale: parseLocale(raw.locale), terms: parseTerms(raw.terms) }) },
  unexpectedErrorLabel: "Failed to enqueue a scoped retranslation via Next route:",
  unexpectedErrorMessage: "Unable to enqueue the retranslation right now.",
  operation: async ({ body, auth }) => {
    const requestedThrough = Date.now();
    getDataBackend();
    const denied = glossaryLocaleAccess(auth, body.locale);
    if (denied) return denied;

    const context = await loadTranslationContext(body.locale);
    const mentioning = await readTranslationsMentioning(body.locale, body.terms);
    const scoped = await scopeStaleTranslations(body.locale, mentioning.map((row) => row.hash), context.promptVersion);
    const records = await recordsMentioning(getPublicDataReadAdapter(), body.terms);
    const runId = randomUUID();
    await enqueueTranslationJobs([body.locale], records.map((record) => translationJobSlug(record.kind, record.slug)), { run: { id: runId, mode: "bulk" } });
    await markRetranslationRequested(body.locale, body.terms, requestedThrough);

    const jobs: RetranslateResponse["jobs"] = {};
    for (const record of records) jobs[record.kind] = (jobs[record.kind] ?? 0) + 1;
    const response: RetranslateResponse = {
      ok: true,
      status: "queued",
      requestedAt: requestedThrough,
      locale: body.locale,
      terms: body.terms,
      promptVersion: context.promptVersion,
      segments: scoped.marked,
      restamped: scoped.restamped,
      runId,
      jobs,
    };
    return NextResponse.json(response);
  },
});
