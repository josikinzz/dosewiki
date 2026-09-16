/**
 * POST /api/dev/translation-glossary/enqueue-all  { locale }
 *
 * Admin only. The main translation for a locale whose glossary is fully
 * reviewed: enqueues every public record of every kind, like
 * `live-mirror.ts enqueue --all` per kind, and the five-minute cron backfills
 * the store from there. Refused while the locale still has draft rows, since
 * a term approved afterwards would need a scoped retranslation of everything
 * that mentions it.
 */
import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { getPublicDataReadAdapter } from "@server/data/publicData.reads";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { glossaryLocales, markRetranslated } from "@server/translation/glossary";
import { publicRecordSlugs, translationJobSlug, TRANSLATION_RECORD_KINDS, type TranslationRecordKind } from "@server/translation/liveTranslation";
import { enqueueTranslationJobs } from "@server/translation/segmentStore";
import { GLOSSARY_BODY_MAX_BYTES, glossaryLocaleAccess, parseLocale } from "../glossaryRoutes";

export const runtime = "nodejs";
export const maxDuration = 120;

type EnqueueAllBody = { locale?: unknown };
type ParsedEnqueueAll = { locale: string };

export const POST = protectedRouteOperation<EnqueueAllBody, ParsedEnqueueAll>({
  auth: "admin",
  rateLimit: "editorHeavyWrite",
  body: { maxBytes: GLOSSARY_BODY_MAX_BYTES, parse: (raw) => ({ locale: parseLocale(raw.locale) }) },
  unexpectedErrorLabel: "Failed to enqueue the main translation via Next route:",
  unexpectedErrorMessage: "Unable to enqueue the main translation right now.",
  operation: async ({ body, auth }) => {
    getDataBackend();
    const denied = glossaryLocaleAccess(auth, body.locale);
    if (denied) return denied;

    const summary = (await glossaryLocales()).find((entry) => entry.locale === body.locale);
    if (!summary || summary.approved === 0) {
      return NextResponse.json({ error: `${body.locale} has no approved glossary yet; draft and review it first.` }, { status: 409 });
    }
    if (summary.draft > 0) {
      return NextResponse.json({ error: `${body.locale} still has ${summary.draft} draft term(s); approve or edit them first.` }, { status: 409 });
    }

    const reads = getPublicDataReadAdapter();
    const jobs: Partial<Record<TranslationRecordKind, number>> = {};
    const slugs: string[] = [];
    for (const kind of TRANSLATION_RECORD_KINDS) {
      const bare = await publicRecordSlugs(reads, kind);
      jobs[kind] = bare.length;
      for (const slug of bare) slugs.push(translationJobSlug(kind, slug));
    }
    await enqueueTranslationJobs([body.locale], slugs);
    await markRetranslated(body.locale);
    return NextResponse.json({ ok: true, locale: body.locale, jobs, total: slugs.length });
  },
});
