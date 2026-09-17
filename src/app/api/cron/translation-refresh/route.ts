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

import { getPublicDataReadAdapter } from "@server/data/publicData.reads";
import { authorizeCronRequest } from "@server/http/cronAuthorization";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { getDataBackend } from "@server/postgres/runtime/backend";
import {
  loadTranslationContext,
  parseTranslationJobSlug,
  readTranslationRecord,
  refreshRecordTranslations,
  type RefreshOutcome,
  type TranslationContext,
} from "@server/translation/liveTranslation";
import {
  claimTranslationJobs,
  completeTranslationJob,
  failTranslationJob,
} from "@server/translation/segmentStore";
import { isPublicLocaleCode } from "../../../../i18n/localeRegistry.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Claim one job at a time so unstarted work does not consume a lease attempt. */
const JOBS_PER_RUN = 1;

/** Reserve the rest of the platform budget for persistence and failure receipts. */
const RUN_BUDGET_MS = 200_000;
const MIN_JOB_BUDGET_MS = 10_000;

export type TranslationRefreshRun = {
  claimed: number;
  completed: number;
  failed: number;
  outcomes: (
    RefreshOutcome | { slug: string; locale: string; error: string }
  )[];
};

export async function GET(request: Request) {
  const decision = authorizeCronRequest(request.headers.get("authorization"), {
    CRON_SECRET: process.env.CRON_SECRET,
  });
  if (!decision.allowed) {
    return NextResponse.json(
      { error: decision.reason },
      { status: decision.status },
    );
  }

  getDataBackend();

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OPENROUTER_API_KEY on the server." },
      { status: 503 },
    );
  }

  const run = await refreshDueArticles(apiKey);
  return NextResponse.json(run, { headers: { "cache-control": "no-store" } });
}

async function refreshDueArticles(
  apiKey: string,
): Promise<TranslationRefreshRun> {
  const started = Date.now();
  const signal = AbortSignal.timeout(RUN_BUDGET_MS);
  const run: TranslationRefreshRun = {
    claimed: 0,
    completed: 0,
    failed: 0,
    outcomes: [],
  };
  const reads = getPublicDataReadAdapter();
  // One prompt digest per locale per run: every segment this invocation stores was made under the glossary as approved when it started.
  const contexts: Record<string, Promise<TranslationContext>> = {};
  const contextFor = (locale: string) =>
    (contexts[locale] ??= loadTranslationContext(locale));

  while (!signal.aborted && Date.now() - started < RUN_BUDGET_MS - MIN_JOB_BUDGET_MS) {
    const jobs = await claimTranslationJobs(JOBS_PER_RUN);
    if (jobs.length === 0) break;
    run.claimed += jobs.length;

    for (const job of jobs) {
      try {
        signal.throwIfAborted();
        const { kind, slug } = parseTranslationJobSlug(job.slug);
        const record = await readTranslationRecord(reads, kind, slug);
        if (!record) {
          // Unpublished or renamed since the write; nothing to mirror.
          if (await completeTranslationJob(job)) run.completed += 1;
          continue;
        }
        const outcome = await refreshRecordTranslations(
          { ...record, slug },
          await contextFor(job.locale),
          kind,
          apiKey,
          signal,
        );
        signal.throwIfAborted();
        // The pending job owns cache delivery until completion, including a
        // retry whose accepted segments were already persisted by an earlier run.
        {
          const targets =
            kind === "profile"
              ? [
                  { kind: "contributor" as const, slug },
                  { kind: "about" as const },
                ]
              : kind === "article"
                ? isPublicLocaleCode(job.locale)
                  ? [
                      {
                        kind: "article-translation" as const,
                        slug,
                        locale: job.locale,
                      },
                    ]
                  : []
                : [{ kind, slug }];
          if (targets.length > 0) {
            const receipts = await publishPublicCache({ targets, source: "manual" });
            if (receipts.length === 0 || receipts.some((receipt) => receipt.status !== "accepted")) {
              throw new Error("Translation cache delivery remains pending");
            }
          }
        }
        if (outcome.rejected.length > 0) {
          throw new Error(`Translation refresh rejected ${outcome.rejected.length} segments`);
        }
        if (await completeTranslationJob(job)) run.completed += 1;
        run.outcomes.push(outcome);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await failTranslationJob(job, message);
        run.failed += 1;
        run.outcomes.push({
          slug: job.slug,
          locale: job.locale,
          error: message,
        });
      }
    }
  }
  return run;
}
