import { describe, expect, it } from "vitest";
import {
  buildOpenRouterRequestBody,
  getClaudeReasoningMaxTokens,
  isClaudeExplicitReasoningModel,
} from "./openrouter";

describe("buildOpenRouterRequestBody", () => {
  it("uses explicit reasoning.max_tokens for Claude 4.5 models", () => {
    const body = buildOpenRouterRequestBody(
      "anthropic/claude-opus-4.5",
      "system",
      "user",
      {
        enableReasoning: true,
        reasoningEffort: "medium",
      },
    );

    expect(isClaudeExplicitReasoningModel("anthropic/claude-opus-4.5")).toBe(true);
    expect(getClaudeReasoningMaxTokens("medium")).toBe(4096);
    expect(body.reasoning).toEqual({
      enabled: true,
      max_tokens: 4096,
    });
    expect((body.reasoning as Record<string, unknown>).effort).toBeUndefined();
  });

  it("uses explicit reasoning.max_tokens for Claude 4.6 models", () => {
    const body = buildOpenRouterRequestBody(
      "anthropic/claude-opus-4.6",
      "system",
      "user",
      {
        enableReasoning: true,
        reasoningEffort: "low",
      },
    );

    expect(isClaudeExplicitReasoningModel("anthropic/claude-opus-4.6")).toBe(true);
    expect(getClaudeReasoningMaxTokens("low")).toBe(2048);
    expect(body.reasoning).toEqual({
      enabled: true,
      max_tokens: 2048,
    });
    expect((body.reasoning as Record<string, unknown>).effort).toBeUndefined();
  });

  it("keeps reasoning.effort for pre-4.5 Claude models", () => {
    const body = buildOpenRouterRequestBody(
      "anthropic/claude-3.7-sonnet",
      "system",
      "user",
      {
        enableReasoning: true,
        reasoningEffort: "high",
      },
    );

    expect(isClaudeExplicitReasoningModel("anthropic/claude-3.7-sonnet")).toBe(false);
    expect(body.reasoning).toEqual({ effort: "high" });
  });

  it("omits reasoning when it is disabled", () => {
    const body = buildOpenRouterRequestBody(
      "anthropic/claude-opus-4.6",
      "system",
      "user",
      {
        enableReasoning: false,
      },
    );

    expect(body.reasoning).toBeUndefined();
  });
});
