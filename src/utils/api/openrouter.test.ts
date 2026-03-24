import { describe, expect, it } from "vitest";
import {
  buildOpenRouterRequestBody,
  getClaude46ReasoningMaxTokens,
  isClaude46Model,
} from "./openrouter";

describe("buildOpenRouterRequestBody", () => {
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

    expect(isClaude46Model("anthropic/claude-opus-4.6")).toBe(true);
    expect(getClaude46ReasoningMaxTokens("low")).toBe(2048);
    expect(body.reasoning).toEqual({
      enabled: true,
      max_tokens: 2048,
    });
    expect((body.reasoning as Record<string, unknown>).effort).toBeUndefined();
  });

  it("keeps reasoning.effort for pre-4.6 Claude models", () => {
    const body = buildOpenRouterRequestBody(
      "anthropic/claude-3.7-sonnet",
      "system",
      "user",
      {
        enableReasoning: true,
        reasoningEffort: "high",
      },
    );

    expect(isClaude46Model("anthropic/claude-3.7-sonnet")).toBe(false);
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
