import { beforeEach, describe, expect, it, vi } from "vitest";

import { segmentHash } from "../../scripts/translation/segment-manifest.mjs";
import { getLocalizedEffectNames } from "./localizedRecords";

const store = vi.hoisted(() => ({
  readTranslations: vi.fn(),
}));
vi.mock("./segmentStore", () => store);
vi.mock("@server/data/publicData", () => ({}));
vi.mock("@server/data/publicData.substances", () => ({}));

describe("getLocalizedEffectNames", () => {
  beforeEach(() => {
    store.readTranslations.mockReset().mockResolvedValue(new Map());
  });

  it("reads the effect title segment for a stored name and keeps English for a name the store lacks", async () => {
    store.readTranslations.mockResolvedValue(
      new Map([[segmentHash("Colour shifting"), "颜色变换"]]),
    );

    const names = await getLocalizedEffectNames(
      ["Colour shifting", "Drifting", "Colour shifting"],
      "zh-Hans",
    );

    expect(names.get("Colour shifting")).toBe("颜色变换");
    expect(names.get("Drifting")).toBe("Drifting");
    expect(store.readTranslations).toHaveBeenCalledWith("zh-Hans", [
      segmentHash("Colour shifting"),
      segmentHash("Drifting"),
    ]);
  });

  it("never asks the store for English", async () => {
    const names = await getLocalizedEffectNames(["Colour shifting"], "en");

    expect(names.get("Colour shifting")).toBe("Colour shifting");
    expect(store.readTranslations).not.toHaveBeenCalled();
  });
});
