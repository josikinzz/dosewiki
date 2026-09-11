/**
 * `GET /api/cron/translation-refresh`: the Vercel cron that keeps the locale
 * mirrors current. Every editorial article write leaves a row in
 * `translationJobs` (see `revalidateSavedPaths`); this route claims due rows,
 * translates the segments the store lacks with the fixed model and prompt,
 * and expires the article's public caches so the mirror re-renders.
 *
 * Scheduled on the editor project, the only deployment holding
 * `OPENROUTER_API_KEY`, the Postgres write credential, and the publication
 * targets. `src/middleware.ts` exempts this exact GET from the editor session
 * gate because Vercel presents `CRON_SECRET`, not a cookie.
 */
import { NextResponse } from "next/server";

import { getPublicDataReadAdapter } from "@server/convex/publicData.reads";
import { authorizeCronRequest } from "@server/http/cronAuthorization";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { parseTranslationJobSlug, readTranslationRecord, refreshRecordTranslations, type RefreshOutcome } from "@server/translation/liveTranslation";
import { claimTranslationJobs, completeTranslationJob, failTranslationJob } from "@server/translation/segmentStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Articles per invocation: one large legality-heavy article is a few hundred segments, about a minute. */
const JOBS_PER_RUN = 3;

/** Stop claiming once this much of the function budget has been spent. */
const RUN_BUDGET_MS = 200_000;

export type TranslationRefreshRun = {
  claimed: number;
  completed: number;
  failed: number;
  outcomes: (RefreshOutcome | { slug: string; locale: string; error: string })[];
};

export async function GET(request: Request) {
  const decision = authorizeCronRequest(request.headers.get("authorization"), {
    CRON_SECRET: process.env.CRON_SECRET,
  });
  if (!decision.allowed) {
    return NextResponse.json({ error: decision.reason }, { status: decision.status });
  }

  if (getDataBackend() !== "postgres") {
    return new Response(null, {
      status: 204,
      headers: { "cache-control": "no-store", "x-translation-refresh": "idle; translations live in Postgres only" },
    });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing OPENROUTER_API_KEY on the server." }, { status: 503 });
  }

  const run = await refreshDueArticles(apiKey);
  return NextResponse.json(run, { headers: { "cache-control": "no-store" } });
}

async function refreshDueArticles(apiKey: string): Promise<TranslationRefreshRun> {
  const started = Date.now();
  const run: TranslationRefreshRun = { claimed: 0, completed: 0, failed: 0, outcomes: [] };
  const reads = getPublicDataReadAdapter();

  while (Date.now() - started < RUN_BUDGET_MS) {
    const jobs = await claimTranslationJobs(JOBS_PER_RUN);
    if (jobs.length === 0) break;
    run.claimed += jobs.length;

    for (const job of jobs) {
      try {
        const { kind, slug } = parseTranslationJobSlug(job.slug);
        const record = await readTranslationRecord(reads, kind, slug);
        if (!record) {
          // Unpublished or renamed since the write; nothing to mirror.
          await completeTranslationJob(job);
          run.completed += 1;
          continue;
        }
        const outcome = await refreshRecordTranslations({ ...record, slug }, job.locale, kind, apiKey);
        if (outcome.stored > 0) {
          await publishPublicCache({ targets: [{ kind, slug }], source: "manual" });
        }
        await completeTranslationJob(job);
        run.completed += 1;
        run.outcomes.push(outcome);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await failTranslationJob(job, message);
        run.failed += 1;
        run.outcomes.push({ slug: job.slug, locale: job.locale, error: message });
      }
    }
  }
  return run;
}
