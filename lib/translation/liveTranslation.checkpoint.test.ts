import { expect, it, vi } from "vitest";

const seams = vi.hoisted(() => ({ translate: vi.fn(), write: vi.fn(async () => {}) }));
vi.mock("../../scripts/translation/engine.mjs", () => ({
  DEFAULT_MODEL: "fixture",
  planBatches: (units: unknown[]) => units.map((unit) => [unit]),
  translateBatchWithRetries: seams.translate,
}));
vi.mock("./glossary", () => ({ glossaryDigestInput: vi.fn(), readGlossaryRows: vi.fn() }));
vi.mock("./glossaryGloss", () => ({ glossDigestInput: vi.fn(), loadGlosses: vi.fn() }));
vi.mock("./segmentStore", () => ({
  writeTranslations: seams.write,
  clearTranslationRejections: async () => {},
  writeTranslationRejections: async () => {},
  pendingTranslationHashes: vi.fn(),
  readTranslations: vi.fn(),
}));

import { translateUnits, type TranslationContext } from "./liveTranslation";
import type { WorkUnit } from "../../scripts/translation/engine.mjs";

it("checkpoints a finished batch while another batch is still pending", async () => {
  let rejectSlow!: (error: Error) => void;
  const slow = new Promise<never>((_, reject) => { rejectSlow = reject; });
  seams.translate.mockImplementation(async ({ units }: { units: WorkUnit[] }) => {
    if (units[0].hash === "slow") return slow;
    return [{ unit: units[0], target: "Перевод", defects: [] }];
  });
  const units = ["fast", "slow"].map((hash) => ({ hash, source: hash })) as WorkUnit[];
  const context = { locale: { code: "ru" }, glossary: {}, kinds: {}, glosses: {}, promptVersion: "fixture" } as TranslationContext;
  const result = translateUnits(units, context, "fixture").catch((error) => error);
  try {
    await vi.waitFor(() => expect(seams.write).toHaveBeenCalledWith([
      expect.objectContaining({ hash: "fast", target: "Перевод" }),
    ]));
  } finally {
    rejectSlow(new Error("deadline"));
  }
  expect(await result).toEqual(new Error("deadline"));
});
