import { afterEach, expect, it, vi } from "vitest";

import { sendBatch, translateBatchWithRetries } from "./engine.mjs";
import { resolveLocale } from "./locales.mjs";

const input = {
  locale: resolveLocale("zh-Hans"),
  model: "test-model",
  apiKey: "test-key",
  userMessage: "Translate the supplied text.",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function pendingFetch() {
  let started!: (request: Request) => void;
  const request = new Promise<Request>((resolve) => { started = resolve; });
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    if (!(input instanceof Request)) throw new Error("Expected an SDK Request");
    started(input);
    return new Promise<Response>((_resolve, reject) => {
      input.signal.addEventListener("abort", () => reject(input.signal.reason), { once: true });
    });
  });
  return { request, fetch };
}

it("caller cancellation aborts the HTTP request without becoming validation retries", async () => {
  const controller = new AbortController();
  const reason = new Error("job deadline reached");
  const { request, fetch } = pendingFetch();
  const result = translateBatchWithRetries({
    ...input,
    signal: controller.signal,
    units: [{
      hash: "test",
      source: "The effect is brief.",
      contextClass: "prose",
      group: "test",
      markup: false,
      words: 4,
      occurrences: 1,
    }],
    glossary: {},
    glosses: {},
    kinds: {},
  });
  const rejected = expect(result).rejects.toBe(reason);
  const sent = await request;
  controller.abort(reason);
  await rejected;
  expect(sent.signal.aborted).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("the default attempt deadline aborts its underlying HTTP request", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const { request } = pendingFetch();
  const result = sendBatch({ ...input, signal: controller.signal });
  const reason = new Error("stop after observing attempt timeout");
  const rejected = expect(result).rejects.toBe(reason);
  const sent = await request;
  vi.advanceTimersByTime(180_000);
  expect(sent.signal.aborted).toBe(true);
  expect(sent.signal.reason).toEqual(expect.objectContaining({ retryable: true }));
  controller.abort(reason);
  await rejected;
});

it("an already aborted caller never starts a request", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    throw new Error("unexpected request");
  });
  const reason = new Error("expired before admission");
  await expect(sendBatch({ ...input, signal: AbortSignal.abort(reason) })).rejects.toBe(reason);
  expect(fetch).not.toHaveBeenCalled();
});

it("caller cancellation interrupts transport backoff without admitting another request", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const reason = new Error("deadline during backoff");
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
    JSON.stringify({ error: { message: "Rate limited", code: 429 } }),
    { status: 429, headers: { "content-type": "application/json" } },
  ));
  const rejected = expect(sendBatch({ ...input, signal: controller.signal })).rejects.toBe(reason);
  // Flush response handling, then stop before the earliest one-second retry.
  await vi.advanceTimersByTimeAsync(999);
  expect(fetch).toHaveBeenCalledTimes(1);
  controller.abort(reason);
  await rejected;
  await vi.advanceTimersByTimeAsync(180_000);
  expect(fetch).toHaveBeenCalledTimes(1);
});
