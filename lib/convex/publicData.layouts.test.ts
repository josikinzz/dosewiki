import { describe, expect, it, vi } from "vitest";
import { getPublicDataOverview } from "./publicData.layouts";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const mocks = vi.hoisted(() => ({
  getPublicSubstances: vi.fn(),
  getPublicEffects: vi.fn(),
  getPublicReplications: vi.fn(),
  getPublicReports: vi.fn(),
  getPublicAboutData: vi.fn(),
  getPublicIndexLayoutByType: vi.fn(),
}));

vi.mock("./publicData.substances", () => ({ getPublicSubstances: mocks.getPublicSubstances }));
vi.mock("./publicData.effects", () => ({
  getPublicEffects: mocks.getPublicEffects,
  getPublicReplications: mocks.getPublicReplications,
}));
vi.mock("./publicData.reports", () => ({ getPublicReports: mocks.getPublicReports }));
vi.mock("./publicData.about", () => ({ getPublicAboutData: mocks.getPublicAboutData }));
vi.mock("./publicData.reads", () => ({
  getPublicDataReadAdapter: () => ({
    getPublicIndexLayoutByType: mocks.getPublicIndexLayoutByType,
  }),
}));

describe("getPublicDataOverview", () => {
  it("counts only listed substances, matching the index and the open-data export", async () => {
    mocks.getPublicSubstances.mockResolvedValue([
      { slug: "lsd", priority: "high" },
      { slug: "mdma", priority: "normal" },
      { slug: "draft-a", priority: "low" },
      { slug: "draft-b", priority: "low" },
    ]);
    mocks.getPublicEffects.mockResolvedValue([{ slug: "tracers" }]);
    mocks.getPublicReports.mockResolvedValue([]);
    mocks.getPublicReplications.mockResolvedValue([]);
    mocks.getPublicAboutData.mockResolvedValue({ markdown: "", subtitle: "" });
    mocks.getPublicIndexLayoutByType.mockResolvedValue({ categories: [{}, {}] });

    const overview = await getPublicDataOverview();

    expect(overview).toMatchObject({
      substanceCount: 2,
      effectCount: 1,
      psychoactiveCategoryCount: 2,
    });
  });
});
