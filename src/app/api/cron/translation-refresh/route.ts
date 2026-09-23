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

import { cronRoute } from "@server/http/cronAuthorization";
import { getDataBackend } from "@server/postgres/runtime/backend";
import { runTranslationJobs, type TranslationWorkerRun } from "@server/translation/jobWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const JOBS_PER_RUN = 1;
const REQUEST_CONCURRENCY = 8;

export type TranslationRefreshRun = TranslationWorkerRun;

export const GET = cronRoute(async function GET() {
  getDataBackend();

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OPENROUTER_API_KEY on the server." },
      { status: 503 },
    );
  }

  const run = await runTranslationJobs(apiKey, {
    mode: "incremental",
    jobsPerRun: JOBS_PER_RUN,
    requestConcurrency: REQUEST_CONCURRENCY,
  });
  return NextResponse.json(run, { headers: { "cache-control": "no-store" } });
});
