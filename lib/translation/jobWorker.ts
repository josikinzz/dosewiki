import "server-only";

import { getPublicDataReadAdapter } from "../data/publicData.reads";
import { getServerDataWriteCapability } from "../data/serverWriteCapability";
import { publishPublicCache } from "../next/publishPublicCache";
import type { PublicationTarget } from "../next/publicationWire";
import { makeFunctionReference } from "../postgres/runtime/api";
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
  claimTranslationCacheJobs,
  completeTranslationCacheJob,
  failTranslationCacheJob,
  recordTranslationWorkerRun,
  releaseTranslationWorkerLease,
  type TranslationJobMode,
  type TranslationJobRow,
  type TranslationWorkerRunRecord,
} from "./segmentStore";

const RUN_BUDGET_MS = 200_000;
const MIN_JOB_BUDGET_MS = 60_000;
const MODEL_LEASE = "glm-5.3-flash";
/** One lease per lane, so a bulk campaign never starves editorial refreshes. */
const laneLease = (mode: TranslationJobMode) => `${MODEL_LEASE}:${mode}`;
const CACHE_JOBS_PER_RUN = 200;
const CACHE_DELIVERY_CONCURRENCY = 50;
const enqueueCacheRetry = makeFunctionReference<"mutation", { targets: PublicationTarget[] }, void>("publicationRecovery:enqueueTranslationCacheRetry");

export type TranslationWorkerRun = Omit<TranslationWorkerRunRecord, "id" | "startedAt"> & {
  outcomes: (RefreshOutcome | { slug: string; locale: string; error: string })[];
};

/**
 * Readable text for anything thrown. Provider failures are `Error`s, but a
 * rejected value can still be a plain object; it never logs as `[object Object]`.
 */
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

/**
 * Process one queue lane under that lane's own lease. Model requests share one
 * semaphore per run, held to the lane's quota of the shared request ceiling.
 */
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

  const deliverCache = async (cacheJob: { locale: string; slug: string; mode: TranslationJobMode; targets: string }) => {
    try {
      const targets = JSON.parse(cacheJob.targets) as PublicationTarget[];
      const receipts = await publishPublicCache({ targets, source: "manual" });
      if (receipts.length > 0 && receipts.every((receipt) => receipt.status === "accepted")) {
        await completeTranslationCacheJob(cacheJob);
        return true;
      }
      const capability = getServerDataWriteCapability();
      if (capability.ok === false) throw new Error(`Public cache publication incomplete: ${capability.failure.message}`);
      await capability.capability.client.mutationAsPublicationRecovery(enqueueCacheRetry, { targets });
      await completeTranslationCacheJob(cacheJob);
      return false;
    } catch (error) {
      // The durable cache row stays leased until its backoff and keeps the
      // reason; after the attempt cap it is a dead letter.
      const message = errorMessage(error);
      console.error("[translation-worker] cache:failed", {
        locale: cacheJob.locale, slug: cacheJob.slug, mode: cacheJob.mode, message,
      });
      await failTranslationCacheJob(cacheJob, message).catch((recordError: unknown) => {
        console.error("[translation-worker] cache:unrecorded", {
          locale: cacheJob.locale, slug: cacheJob.slug, mode: cacheJob.mode, message: errorMessage(recordError),
        });
      });
      return false;
    }
  };
  const cacheJobs = await claimTranslationCacheJobs(CACHE_JOBS_PER_RUN);
  let cacheCursor = 0;
  await Promise.all(Array.from(
    { length: Math.min(CACHE_DELIVERY_CONCURRENCY, cacheJobs.length) },
    async () => {
      while (cacheCursor < cacheJobs.length) {
        const cacheJob = cacheJobs[cacheCursor];
        cacheCursor += 1;
        if (!(await deliverCache(cacheJob))) run.cachePending += 1;
      }
    },
  ));

  // A bulk run writes through one writer and requests a segment shared by
  // several pages once.
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
      // Loaded per page, so a glossary approval reaches the next page claimed.
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
      const targets = kind === "profile"
        ? [{ kind: "contributor" as const, slug }, { kind: "about" as const }]
        : kind === "article"
          ? isPublicLocaleCode(job.locale)
            ? [{ kind: "article-translation" as const, slug, locale: job.locale }]
            : []
          : [{ kind, slug }];
      if (await completeTranslationJob(job, terminalDetail, targets)) {
        run.completed += 1;
        if (targets.length > 0) {
          if (!(await deliverCache({ locale: job.locale, slug: job.slug, mode: job.mode, targets: JSON.stringify(targets) }))) {
            run.cachePending += 1;
          }
        }
      }
      run.outcomes.push(outcome);
    } catch (error) {
      const message = errorMessage(error);
      // A budget abort after stored progress keeps its attempt; see failTranslationJob.
      const progressed = signal.aborted && stored > 0;
      const exhausted = !progressed && job.attempts >= MAX_TRANSLATION_JOB_ATTEMPTS;
      // A transport failure carries its own defect code and provider status.
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

  // Each page worker refills independently, so one slow page cannot hold
  // every other page behind a batch barrier. Leave time to drain at the end.
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
