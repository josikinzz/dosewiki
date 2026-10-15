export type BuildConcurrency = {
  cpus: number;
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

export const BUILD_CONCURRENCY_LIMITS: Readonly<BuildConcurrency> = Object.freeze({
  cpus: 16,
  staticGenerationMaxConcurrency: 8,
});

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
