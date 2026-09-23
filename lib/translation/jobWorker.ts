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
  type TranslationContext,
} from "./liveTranslation";
import { createTranslationRequestPool } from "./requestPool";
import {
  MAX_TRANSLATION_JOB_ATTEMPTS,
  claimTranslationJobs,
  completeTranslationJob,
  failTranslationJob,
  acquireTranslationWorkerLease,
  completeTranslationCacheJob,
  readTranslationCacheJobs,
  recordTranslationWorkerRun,
  releaseTranslationWorkerLease,
  type TranslationJobMode,
  type TranslationWorkerRunRecord,
} from "./segmentStore";

const RUN_BUDGET_MS = 200_000;
const MIN_JOB_BUDGET_MS = 10_000;
const MODEL_LEASE = "glm-5.3-flash";
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

/** Process one isolated queue lane through one shared model-request semaphore. */
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
  try {
    run.leaseHeld = await acquireTranslationWorkerLease(MODEL_LEASE, leaseOwner, RUN_BUDGET_MS + 30_000);
    if (run.leaseHeld) {
      try {
        await processTranslationJobs(apiKey, config, run, started);
      } finally {
        await releaseTranslationWorkerLease(MODEL_LEASE, leaseOwner);
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
  const requestPool = createTranslationRequestPool(config.requestConcurrency);
  const contexts: Record<string, Promise<TranslationContext>> = {};
  const contextFor = (locale: string) => (contexts[locale] ??= loadTranslationContext(locale));
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
      if (capability.ok === false) return false;
      await capability.capability.client.mutationAsPublicationRecovery(enqueueCacheRetry, { targets });
      await completeTranslationCacheJob(cacheJob);
      return false;
    } catch (error) {
      // The durable cache row remains due for the next invocation.
      console.error("[translation-worker] cache:failed", {
        locale: cacheJob.locale, slug: cacheJob.slug, mode: cacheJob.mode, message: errorMessage(error),
      });
      return false;
    }
  };
  const cacheJobs = await readTranslationCacheJobs(CACHE_JOBS_PER_RUN);
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
  while (!signal.aborted && Date.now() - started < RUN_BUDGET_MS - MIN_JOB_BUDGET_MS) {
    const jobs = await claimTranslationJobs(config.jobsPerRun, config.mode);
    if (jobs.length === 0) break;
    run.claimed += jobs.length;
    // A bulk wave writes through one pool-sized writer and requests a shared segment once.
    const wave = config.mode === "bulk" ? createTranslationWave() : undefined;

    await Promise.all(jobs.map(async (job) => {
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
          await contextFor(job.locale),
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
    }));
  }
}
