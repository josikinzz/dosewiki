import { describe, expect, it, vi } from "vitest";

import {
  callWithRetry,
  createBatchOpenRouterAdapter,
  getRetryDelayMs,
} from "./openrouter-adapter.mjs";

const CONFIG = {
  model: "anthropic/claude-opus-4.5",
  maxTokens: 4096,
  temperature: 0.2,
  retryAttempts: 3,
  retryDelayMs: 100,
  reasoningEffort: "high",
};

function response(overrides = {}) {
  return {
    content: "generated",
    usage: {
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    },
    finishReason: "stop",
    reasoning: "",
    response: { id: "response-id" },
    ...overrides,
  };
}

describe("batch OpenRouter adapter retry policy", () => {
  it("calculates exponential retry delays", () => {
    expect(getRetryDelayMs(2000, 0)).toBe(2000);
    expect(getRetryDelayMs(2000, 1)).toBe(4000);
    expect(getRetryDelayMs(2000, 2)).toBe(8000);
  });

  it("retries retryable errors with injectable sleep", async () => {
    const sleep = vi.fn();
    const log = vi.fn();
    const firstError = { retryable: true, message: "rate limited" };
    const fn = vi
      .fn()
      .mockRejectedValueOnce(firstError)
      .mockResolvedValueOnce("ok");

    await expect(
      callWithRetry(fn, {
        attempts: 3,
        retryDelayMs: 250,
        sleep,
        log,
      }),
    ).resolves.toBe("ok");

    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
    expect(log).toHaveBeenCalledWith("  Retry 1/3 after 250ms...");
  });

  it("does not retry non-retryable errors", async () => {
    const sleep = vi.fn();
    const error = { retryable: false, message: "bad key" };

    await expect(
      callWithRetry(() => Promise.reject(error), {
        attempts: 3,
        retryDelayMs: 250,
        sleep,
        log: vi.fn(),
      }),
    ).rejects.toBe(error);

    expect(sleep).not.toHaveBeenCalled();
  });

  it("throws the final retryable error after max attempts", async () => {
    const firstError = { retryable: true, message: "first" };
    const finalError = { retryable: true, message: "final" };
    const fn = vi
      .fn()
      .mockRejectedValueOnce(firstError)
      .mockRejectedValueOnce(finalError);

    await expect(
      callWithRetry(fn, {
        attempts: 2,
        retryDelayMs: 100,
        sleep: vi.fn(),
        log: vi.fn(),
      }),
    ).rejects.toBe(finalError);

    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("batch OpenRouter adapter calls", () => {
  it("passes app title, model, reasoning, and generation options through exactly", async () => {
    const callChat = vi.fn().mockResolvedValue(response());
    const adapter = createBatchOpenRouterAdapter({
      apiKey: "sk-test",
      appTitle: "Dose.wiki Batch Test Generator",
      config: CONFIG,
      callChat,
    });

    await adapter.call({
      systemPrompt: "system",
      userMessage: "user",
      options: {
        reasoningEffort: "medium",
        temperature: 0.7,
        maxTokens: 1024,
      },
    });

    expect(callChat).toHaveBeenCalledWith({
      apiKey: "sk-test",
      appTitle: "Dose.wiki Batch Test Generator",
      model: "anthropic/claude-opus-4.5",
      systemPrompt: "system",
      userMessage: "user",
      temperature: 0.7,
      maxTokens: 1024,
      reasoningEffort: "medium",
      disableReasoning: false,
    });
  });

  it("writes an empty-content debug artifact", async () => {
    const writeDebugArtifact = vi.fn();
    const adapter = createBatchOpenRouterAdapter({
      apiKey: "sk-test",
      appTitle: "Dose.wiki Batch Test Generator",
      config: CONFIG,
      callChat: vi.fn().mockResolvedValue(response({
        content: " ",
        finishReason: "stop",
        response: { choices: [] },
      })),
      emptyContentDebugSuffix: "empty-content",
      writeDebugArtifact,
    });

    await adapter.call({
      systemPrompt: "system",
      userMessage: "user",
      debugContext: { slug: "lsd", title: "LSD" },
    });

    expect(writeDebugArtifact).toHaveBeenCalledWith({
      debugContext: { slug: "lsd", title: "LSD" },
      suffix: "empty-content",
      payload: JSON.stringify({ choices: [] }, null, 2),
      metadata: {
        title: "LSD",
        finishReason: "stop",
        message: "OpenRouter response contained no extractable message content",
      },
    });
  });

  it("can retry empty length responses without reasoning", async () => {
    const callChat = vi
      .fn()
      .mockResolvedValueOnce(response({
        content: "",
        finishReason: "length",
        reasoning: "used answer budget",
      }))
      .mockResolvedValueOnce(response({
        content: "fallback content",
        finishReason: "stop",
        reasoning: "",
      }));
    const adapter = createBatchOpenRouterAdapter({
      apiKey: "sk-test",
      appTitle: "Dose.wiki Batch Pharmacology Generator",
      config: CONFIG,
      callChat,
      retryWithoutReasoningOnEmptyLength: true,
    });

    await expect(
      adapter.call({
        systemPrompt: "system",
        userMessage: "user",
      }),
    ).resolves.toMatchObject({ content: "fallback content" });

    expect(callChat).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ disableReasoning: false }),
    );
    expect(callChat).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ disableReasoning: true }),
    );
  });
});
