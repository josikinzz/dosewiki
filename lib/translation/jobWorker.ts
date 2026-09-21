import "server-only";

import { getPublicDataReadAdapter } from "../data/publicData.reads";
import { getServerDataWriteCapability } from "../data/serverWriteCapability";
import { publishPublicCache } from "../next/publishPublicCache";
import type { PublicationTarget } from "../next/publicationWire";
import { makeFunctionReference } from "../postgres/runtime/api";
import { isPublicLocaleCode } from "../../src/i18n/localeRegistry.mjs";
import {
  loadTranslationContext,
  parseTranslationJobSlug,
  readTranslationRecord,
  refreshRecordTranslations,
  type RefreshOutcome,
  type TranslationContext,
} from "./liveTranslation";
import { createTranslationRequestPool } from "./requestPool";
import {
  claimTranslationJobs,
  completeTranslationJob,
  failTranslationJob,
  acquireTranslationWorkerLease,
  completeTranslationCacheJob,
  readTranslationCacheJobs,
  releaseTranslationWorkerLease,
  type TranslationJobMode,
} from "./segmentStore";

const RUN_BUDGET_MS = 200_000;
const MIN_JOB_BUDGET_MS = 10_000;
const MODEL_LEASE = "glm-5.3-flash";
const CACHE_JOBS_PER_RUN = 200;
const CACHE_DELIVERY_CONCURRENCY = 50;
const enqueueCacheRetry = makeFunctionReference<"mutation", { targets: PublicationTarget[] }, void>("publicationRecovery:enqueueTranslationCacheRetry");

export type TranslationWorkerRun = {
  claimed: number;
  completed: number;
  failed: number;
  cachePending: number;
  outcomes: (RefreshOutcome | { slug: string; locale: string; error: string })[];
};

/** Process one isolated queue lane through one shared model-request semaphore. */
export async function runTranslationJobs(
  apiKey: string,
  config: { mode: TranslationJobMode; jobsPerRun: number; requestConcurrency: number },
): Promise<TranslationWorkerRun> {
  const started = Date.now();
  const signal = AbortSignal.timeout(RUN_BUDGET_MS);
  const run: TranslationWorkerRun = { claimed: 0, completed: 0, failed: 0, cachePending: 0, outcomes: [] };
  const leaseOwner = crypto.randomUUID();
  if (!(await acquireTranslationWorkerLease(MODEL_LEASE, leaseOwner, RUN_BUDGET_MS + 30_000))) return run;
  const reads = getPublicDataReadAdapter();
  const requestPool = createTranslationRequestPool(config.requestConcurrency);
  const contexts: Record<string, Promise<TranslationContext>> = {};
  const contextFor = (locale: string) => (contexts[locale] ??= loadTranslationContext(locale));

  try {
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
        await capability.capability.client.mutationAsService(enqueueCacheRetry, { targets });
        await completeTranslationCacheJob(cacheJob);
        return false;
      } catch { return false; /* The durable cache row remains due for the next invocation. */ }
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

    await Promise.all(jobs.map(async (job) => {
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
          { signal, requestPool },
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
        const message = error instanceof Error ? error.message : String(error);
        await failTranslationJob(job, message);
        run.failed += 1;
        run.outcomes.push({ slug: job.slug, locale: job.locale, error: message });
      }
    }));
    }
    return run;
  } finally {
    await releaseTranslationWorkerLease(MODEL_LEASE, leaseOwner);
  }
}
