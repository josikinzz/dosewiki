/**
 * How many pages `next build` renders at once, from two environment
 * variables with the laptop's numbers as the defaults.
 *
 * Static generation reads a multi-megabyte substance library once per worker
 * and every page fans out server reads against a four-connection pool. On a
 * laptop far from the database, four long-lived workers rendering one page
 * each finish the build reliably; letting Next use every CPU creates a
 * cold-start thundering herd against Postgres. A runner next to the database
 * can afford more, but only as far as measured connection counts allow, so
 * the override is clamped and every raise is recorded in the deployment
 * runbook with its elapsed time and peak connections.
 */

export type BuildConcurrency = {
  /** `experimental.cpus`: static generation worker processes. */
  cpus: number;
  /** `experimental.staticGenerationMaxConcurrency`: pages in flight per worker. */
  staticGenerationMaxConcurrency: number;
};

export type BuildConcurrencyEnv = Record<string, string | undefined> & {
  DOSEWIKI_BUILD_WORKERS?: string;
  DOSEWIKI_BUILD_PAGES_PER_WORKER?: string;
};

export const BUILD_CONCURRENCY_DEFAULTS: Readonly<BuildConcurrency> = Object.freeze({
  cpus: 4,
  staticGenerationMaxConcurrency: 1,
});

/** Inclusive ceilings. Above these the pool math stops being a bound at all. */
export const BUILD_CONCURRENCY_LIMITS: Readonly<BuildConcurrency> = Object.freeze({
  cpus: 16,
  staticGenerationMaxConcurrency: 8,
});

/** A positive integer within `[1, limit]`, or `fallback` for anything else. */
function clampedInteger(raw: string | undefined, limit: number, fallback: number): number {
  const text = raw?.trim() ?? "";
  if (!/^\d+$/.test(text)) return fallback;
  const value = Number(text);
  if (value < 1 || value > limit) return fallback;
  return value;
}

export function resolveBuildConcurrency(env: BuildConcurrencyEnv = process.env): BuildConcurrency {
  return {
    cpus: clampedInteger(env.DOSEWIKI_BUILD_WORKERS, BUILD_CONCURRENCY_LIMITS.cpus, BUILD_CONCURRENCY_DEFAULTS.cpus),
    staticGenerationMaxConcurrency: clampedInteger(
      env.DOSEWIKI_BUILD_PAGES_PER_WORKER,
      BUILD_CONCURRENCY_LIMITS.staticGenerationMaxConcurrency,
      BUILD_CONCURRENCY_DEFAULTS.staticGenerationMaxConcurrency,
    ),
  };
}
