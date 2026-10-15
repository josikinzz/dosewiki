import "server-only";

import { getPublicDataReadAdapter } from "../data/publicData.reads";
import { applyPublicCacheLocally } from "../next/publishPublicCache";
import type { PublicationTarget } from "../next/publicationWire";
import { isPublicLocaleCode } from "../../src/i18n/localeRegistry.mjs";
import {
  createTranslationWave,
  loadTranslationContext,
  parseTranslationJobSlug,
  readTranslationRecord,
  refreshRecordTranslations,
  type RefreshOutcome,
} from "./liveTranslation";
import { TRANSLATION_REQUEST_QUOTA, createTranslationRequestPool } from "./requestPool";
import {
  MAX_TRANSLATION_JOB_ATTEMPTS,
  claimTranslationJobs,
  completeTranslationJob,
  failTranslationJob,
  acquireTranslationWorkerLease,
  recordTranslationWorkerRun,
  releaseTranslationWorkerLease,
  type TranslationJobMode,
  type TranslationJobRow,
  type TranslationWorkerRunRecord,
} from "./segmentStore";

const RUN_BUDGET_MS = 200_000;
const MIN_JOB_BUDGET_MS = 60_000;
const MODEL_LEASE = "glm-5.3-flash";
const laneLease = (mode: TranslationJobMode) => `${MODEL_LEASE}:${mode}`;

export type TranslationWorkerRun = Omit<TranslationWorkerRunRecord, "id" | "startedAt"> & {
  outcomes: (RefreshOutcome | { slug: string; locale: string; error: string })[];
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

export async function runTranslationJobs(
  apiKey: string,
  config: { mode: TranslationJobMode; jobsPerRun: number; requestConcurrency: number },
): Promise<TranslationWorkerRun> {
  const started = Date.now();
  const run: TranslationWorkerRun = {
    mode: config.mode, leaseHeld: false, durationMs: 0, claimed: 0, completed: 0, failed: 0, exhausted: 0, cachePending: 0,
    usage: { prompt: 0, completion: 0, requests: 0 }, firstError: null, outcomes: [],
  };
  const leaseOwner = crypto.randomUUID();
  const lease = laneLease(config.mode);
  try {
    run.leaseHeld = await acquireTranslationWorkerLease(lease, leaseOwner, RUN_BUDGET_MS + 30_000);
    if (run.leaseHeld) {
      try {
        await processTranslationJobs(apiKey, config, run, started);
      } finally {
        await releaseTranslationWorkerLease(lease, leaseOwner);
      }
    }
  } catch (error) {
    run.firstError ??= errorMessage(error);
    throw error;
  } finally {
    run.durationMs = Date.now() - started;
    await recordRun(leaseOwner, started, run);
  }
  return run;
}

async function recordRun(id: string, startedAt: number, run: TranslationWorkerRun): Promise<void> {
  const { outcomes: _outcomes, ...summary } = run;
  try {
    await recordTranslationWorkerRun({ id, startedAt, ...summary });
  } catch (error) {
    console.error("[translation-worker] run:unrecorded", { ...summary, message: errorMessage(error) });
  }
}

async function processTranslationJobs(
  apiKey: string,
  config: { mode: TranslationJobMode; jobsPerRun: number; requestConcurrency: number },
  run: TranslationWorkerRun,
  started: number,
): Promise<void> {
  const signal = AbortSignal.timeout(RUN_BUDGET_MS);
  const reads = getPublicDataReadAdapter();
  const requestPool = createTranslationRequestPool(Math.min(config.requestConcurrency, TRANSLATION_REQUEST_QUOTA[config.mode]));
  const onUsage = (used: { prompt: number; completion: number }) => {
    run.usage.prompt += used.prompt;
    run.usage.completion += used.completion;
    run.usage.requests += 1;
  };

  const expireLocally = (job: TranslationJobRow, targets: PublicationTarget[]) => {
    try {
      applyPublicCacheLocally({ targets, source: "manual" });
    } catch (error) {
      console.error("[translation-worker] cache:local-failed", {
        locale: job.locale, slug: job.slug, mode: job.mode, message: errorMessage(error),
      });
    }
  };

  const wave = config.mode === "bulk" ? createTranslationWave() : undefined;
  const processJob = async (job: TranslationJobRow) => {
    let stored = 0;
    try {
      signal.throwIfAborted();
      const { kind, slug } = parseTranslationJobSlug(job.slug);
      const record = await readTranslationRecord(reads, kind, slug);
      if (!record) {
        if (await completeTranslationJob(job)) run.completed += 1;
        return;
      }
      const outcome = await refreshRecordTranslations(
        { ...record, slug },
        await loadTranslationContext(job.locale),
        kind,
        apiKey,
        { signal, requestPool, wave, onUsage, onStored: (count) => { stored += count; } },
      );
      signal.throwIfAborted();
      const terminalDetail = outcome.rejected.length > 0
        ? `Translation completed with ${outcome.rejected.length} rejected ${outcome.rejected.length === 1 ? "segment" : "segments"}`
        : null;
      const targets: PublicationTarget[] = kind === "profile"
        ? [{ kind: "contributor" as const, slug }, { kind: "about" as const }]
        : kind === "article"
          ? isPublicLocaleCode(job.locale)
            ? [{ kind: "article-translation" as const, slug, locale: job.locale }]
            : []
          : [{ kind, slug }];
      if (await completeTranslationJob(job, terminalDetail, targets)) {
        run.completed += 1;
        if (targets.length > 0) {
          run.cachePending += 1;
          expireLocally(job, targets);
        }
      }
      run.outcomes.push(outcome);
    } catch (error) {
      const message = errorMessage(error);
      const progressed = signal.aborted && stored > 0;
      const exhausted = !progressed && job.attempts >= MAX_TRANSLATION_JOB_ATTEMPTS;
      const tagged = error && typeof error === "object" ? error as { code?: unknown; status?: unknown } : {};
      console.error("[translation-worker] job:failed", {
        locale: job.locale, slug: job.slug, mode: job.mode, attempts: job.attempts, exhausted, message,
        ...(typeof tagged.code === "string" ? { code: tagged.code } : {}),
        ...(typeof tagged.status === "number" ? { status: tagged.status } : {}),
      });
      await failTranslationJob(job, message, { progressed });
      run.failed += 1;
      if (exhausted) run.exhausted += 1;
      run.firstError ??= message;
      run.outcomes.push({ slug: job.slug, locale: job.locale, error: message });
    }
  };

  const workers = await Promise.allSettled(Array.from({ length: config.jobsPerRun }, async () => {
    while (!signal.aborted && Date.now() - started < RUN_BUDGET_MS - MIN_JOB_BUDGET_MS) {
      const [job] = await claimTranslationJobs(1, config.mode);
      if (!job) break;
      run.claimed += 1;
      await processJob(job);
    }
  }));
  const failure = workers.find((worker) => worker.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}
