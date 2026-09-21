export const MAX_TRANSLATION_REQUEST_CONCURRENCY = 100;

export type TranslationRequestPool = {
  readonly limit: number;
  readonly inFlight: number;
  readonly pending: number;
  run<T>(task: () => Promise<T>): Promise<T>;
};

/** One shared semaphore for every model batch in a bulk refresh invocation. */
export function createTranslationRequestPool(limit = MAX_TRANSLATION_REQUEST_CONCURRENCY): TranslationRequestPool {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_TRANSLATION_REQUEST_CONCURRENCY) {
    throw new Error(`Translation concurrency must be between 1 and ${MAX_TRANSLATION_REQUEST_CONCURRENCY}.`);
  }

  let inFlight = 0;
  const waiters: Array<() => void> = [];
  const acquire = async () => {
    if (inFlight < limit) {
      inFlight += 1;
      return;
    }
    await new Promise<void>((resolve) => waiters.push(resolve));
  };
  const release = () => {
    const next = waiters.shift();
    if (next) next();
    else inFlight -= 1;
  };

  return {
    limit,
    get inFlight() { return inFlight; },
    get pending() { return waiters.length; },
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}
