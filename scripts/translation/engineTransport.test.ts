import { afterEach, expect, it, vi } from "vitest";

import { translateBatchWithRetries } from "./engine.mjs";
import { resolveLocale } from "./locales.mjs";
import { DEFECT_CODES } from "./validate.mjs";

/** The engine's own transport retry ceiling for one request. */
const TRANSPORT_ATTEMPTS = 4;

const batch = {
  locale: resolveLocale("zh-Hans"),
  model: "test-model",
  apiKey: "test-key",
  glossary: {},
  glosses: {},
  kinds: {},
  signal: new AbortController().signal,
  units: Array.from({ length: 40 }, (_, index) => ({
    hash: `unit-${index}`,
    source: `The effect number ${index} is brief.`,
    contextClass: "prose" as const,
    group: "test",
    markup: false,
    words: 5,
    occurrences: 1,
  })),
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function respondWith(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));
}

it("fails a batch on an authorization or credit refusal instead of rejecting its content", async () => {
  const fetch = respondWith(402, { error: { code: 402, message: "Insufficient credits" } });
  const error = await translateBatchWithRetries(batch).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({ code: DEFECT_CODES.TRANSPORT_FAILURE, status: 402, retryable: false });
  expect(DEFECT_CODES.TRANSPORT_FAILURE).not.toBe(DEFECT_CODES.UNPARSABLE_OUTPUT);
  expect(fetch.mock.calls.length).toBeLessThanOrEqual(TRANSPORT_ATTEMPTS);
});

it("fails a batch once transport retries are spent instead of retrying unit by unit", async () => {
  vi.useFakeTimers();
  const fetch = respondWith(503, { error: { code: 503, message: "Unavailable" } });
  const settled = translateBatchWithRetries(batch).catch((caught: unknown) => caught);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(await settled).toMatchObject({ code: DEFECT_CODES.TRANSPORT_FAILURE, status: 503, retryable: true });
  expect(fetch).toHaveBeenCalledTimes(TRANSPORT_ATTEMPTS);
});

it("still rejects unparsable content as a content defect", async () => {
  respondWith(200, {
    id: "chat-fixture", object: "chat.completion", created: 1, model: "test-model", system_fingerprint: "fixture",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "not json at all" } }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
  const verdicts = await translateBatchWithRetries({ ...batch, units: batch.units.slice(0, 1) });
  expect(verdicts).toHaveLength(1);
  expect(verdicts[0].defects).toEqual([DEFECT_CODES.UNPARSABLE_OUTPUT]);
});
