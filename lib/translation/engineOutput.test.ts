// @vitest-environment node
import { expect, it, vi } from "vitest";
const chat = vi.hoisted(() => vi.fn());
vi.mock("../../scripts/lib/openrouter-sdk.mjs", () => ({ callOpenRouterChat: chat }));
import { translateBatch } from "../../scripts/translation/engine.mjs";
import { resolveLocale } from "../../scripts/translation/locales.mjs";

it("retains valid peers when one model field is not a string", async () => {
  chat.mockResolvedValue({ content: JSON.stringify({ s0: null, s1: "浅色" }), usage: { promptTokens: 1, completionTokens: 1 } });
  const result = await translateBatch({
    locale: resolveLocale("zh-Hans"), model: "fixture", apiKey: "fixture", glossary: {}, glosses: {}, kinds: {},
    units: [{ hash: "bad", source: "Dark" }, { hash: "good", source: "Light" }].map((unit) => ({ ...unit, contextClass: "prose" as const, group: "ui", markup: false, words: 1, occurrences: 1 })),
  });
  expect(result.results[0]).toMatchObject({ target: null, parseCode: "UNPARSABLE_OUTPUT" });
  expect(result.results[1]).toMatchObject({ target: "浅色", parseCode: null });
});
