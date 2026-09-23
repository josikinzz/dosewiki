import { afterEach, expect, it, vi } from "vitest";

import { OpenRouterChatError, callOpenRouterChat } from "./openrouter-sdk.mjs";

const input = {
  apiKey: "test-key",
  appTitle: "test",
  model: "test-model",
  systemPrompt: "Translate.",
  userMessage: "Hello.",
  signal: new AbortController().signal,
};

afterEach(() => {
  vi.restoreAllMocks();
});

function respondWith(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));
}

it("normalizes a provider refusal into an Error that carries status and retryability", async () => {
  respondWith(402, { error: { code: 402, message: "Insufficient credits" } });
  const error = await callOpenRouterChat(input).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(Error);
  expect(error).toBeInstanceOf(OpenRouterChatError);
  expect(error).toMatchObject({ status: 402, retryable: false });
  expect(String(error)).not.toContain("[object Object]");
  expect(String(error)).toContain("Insufficient credits");
});

it("marks rate limits and server errors retryable", async () => {
  respondWith(429, { error: { code: 429, message: "Slow down" } });
  await expect(callOpenRouterChat(input)).rejects.toMatchObject({ status: 429, retryable: true });
});

it("wraps a network failure without a status", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
  const error = await callOpenRouterChat(input).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(OpenRouterChatError);
  expect(error).toMatchObject({ status: null, retryable: true });
  expect((error as Error).message).not.toBe("");
});
