import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  effectsIndexEmptyState,
  getSubstancesLayoutRouteOutcome,
  reportsIndexEmptyState,
} from "./publicRouteOutcomes";

vi.mock("server-only", () => ({}));

const publicData = vi.hoisted(() => ({
  getPublicCategoryLayout: vi.fn(),
  getPublicSubstanceLookup: vi.fn(),
}));

vi.mock("@server/data/publicData", () => publicData);

describe("public route outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps unavailable substances layout distinct from an empty valid route", async () => {
    publicData.getPublicCategoryLayout.mockResolvedValueOnce(null);
    publicData.getPublicSubstanceLookup.mockResolvedValueOnce([]);

    await expect(getSubstancesLayoutRouteOutcome()).resolves.toEqual({
      route: "substances",
      state: "unavailable",
      reason: "category-layout-unavailable",
    });
  });

  it("returns a substances layout found outcome when layout data is available", async () => {
    const layout = { groups: [] };
    const substances = [{ slug: "lsd", title: "LSD" }];
    publicData.getPublicCategoryLayout.mockResolvedValueOnce(layout);
    publicData.getPublicSubstanceLookup.mockResolvedValueOnce(substances);

    await expect(getSubstancesLayoutRouteOutcome()).resolves.toEqual({
      route: "substances",
      state: "found",
      layout,
      substances,
    });
  });

  it("exports reusable empty-state view models for valid empty indexes", () => {
    expect(effectsIndexEmptyState).toMatchObject({
      badge: "No effects",
      title: "No effects found",
    });
    expect(reportsIndexEmptyState).toMatchObject({
      badge: "No reports yet",
      title: "No trip reports found",
    });
  });
});
