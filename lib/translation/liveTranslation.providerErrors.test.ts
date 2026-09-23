import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  writeTranslations: vi.fn(), writeTranslationRejections: vi.fn(), clearTranslationRejections: vi.fn(),
}));
vi.mock("./segmentStore", () => ({
  ...store,
  pendingTranslationHashes: vi.fn(),
  readTranslations: vi.fn(),
}));

import { DEFECT_CODES } from "../../scripts/translation/validate.mjs";
import { translateUnits, translationContextFromRows } from "./liveTranslation";

const context = translationContextFromRows("zh-Hans", [], {});
const units = Array.from({ length: 3 }, (_, index) => ({
  hash: `unit-${index}`,
  source: `The effect number ${index} is brief.`,
  contextClass: "prose" as const,
  group: "test",
  markup: false,
  words: 5,
  occurrences: 1,
}));

function respondWith(status: number, body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));
}

beforeEach(() => {
  for (const write of Object.values(store)) write.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { vi.restoreAllMocks(); });

describe("terminal provider errors", () => {
  it("fail the refresh and write no content rejection", async () => {
    respondWith(402, { error: { code: 402, message: "Insufficient credits" } });
    await expect(translateUnits(units, context, "test-key", { signal: new AbortController().signal }))
      .rejects.toMatchObject({ code: DEFECT_CODES.TRANSPORT_FAILURE, status: 402 });
    const rejected = store.writeTranslationRejections.mock.calls.flatMap(([rows]) => rows);
    expect(rejected).toEqual([]);
  });

  it("still record unparsable content as a rejection", async () => {
    respondWith(200, {
      id: "chat-fixture", object: "chat.completion", created: 1, model: "test-model", system_fingerprint: "fixture",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "not json at all" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
    const result = await translateUnits(units.slice(0, 1), context, "test-key", { signal: new AbortController().signal });
    expect(result.rejected).toEqual([{ hash: "unit-0", defects: [DEFECT_CODES.UNPARSABLE_OUTPUT] }]);
    expect(store.writeTranslationRejections).toHaveBeenCalledWith([
      expect.objectContaining({ hash: "unit-0", defects: [DEFECT_CODES.UNPARSABLE_OUTPUT] }),
    ]);
  });
});
