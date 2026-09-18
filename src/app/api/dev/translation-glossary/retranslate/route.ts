/**
 * POST /api/dev/translation-glossary/retranslate  { locale, terms: string[] }
 *
 * Admin only. The scoped stale replay after a glossary edit, through the job
 * outbox instead of a workstation: stored segments whose English mentions a
 * term are marked stale, every other segment on an older digest is restamped
 * with the current one (a segment without the term receives a byte-identical
 * prompt), and every public record mentioning a term is enqueued. The
 * five-minute cron then retranslates exactly the marked segments.
 *
 * Reads the whole corpus to find those records, like `live-mirror.ts stale`.
 */
import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { getPublicDataReadAdapter } from "@server/data/publicData.reads";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { markRetranslated } from "@server/translation/glossary";
import { loadTranslationContext, recordsMentioning, translationJobSlug, type TranslationRecordKind } from "@server/translation/liveTranslation";
import { enqueueTranslationJobs, readTranslationsMentioning, scopeStaleTranslations } from "@server/translation/segmentStore";
import { GLOSSARY_BODY_MAX_BYTES, glossaryLocaleAccess, parseLocale, parseTerms } from "../glossaryRoutes";

export const runtime = "nodejs";
export const maxDuration = 300;

type RetranslateBody = { locale?: unknown; terms?: unknown };
type ParsedRetranslate = { locale: string; terms: string[] };

export type RetranslateResponse = {
  ok: true;
  locale: string;
  terms: string[];
  promptVersion: string;
  /** Stored segments mentioning a term, now marked stale. */
  segments: number;
  /** Segments on an older digest that mention no term, restamped with the current one. */
  restamped: number;
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
    getDataBackend();
    const denied = glossaryLocaleAccess(auth, body.locale);
    if (denied) return denied;

    const context = await loadTranslationContext(body.locale);
    const mentioning = await readTranslationsMentioning(body.locale, body.terms);
    const scoped = await scopeStaleTranslations(body.locale, mentioning.map((row) => row.hash), context.promptVersion);
    const records = await recordsMentioning(getPublicDataReadAdapter(), body.terms);
    await enqueueTranslationJobs([body.locale], records.map((record) => translationJobSlug(record.kind, record.slug)));
    await markRetranslated(body.locale, body.terms);

    const jobs: RetranslateResponse["jobs"] = {};
    for (const record of records) jobs[record.kind] = (jobs[record.kind] ?? 0) + 1;
    const response: RetranslateResponse = {
      ok: true,
      locale: body.locale,
      terms: body.terms,
      promptVersion: context.promptVersion,
      segments: scoped.marked,
      restamped: scoped.restamped,
      jobs,
    };
    return NextResponse.json(response);
  },
});
