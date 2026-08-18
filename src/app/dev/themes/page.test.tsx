import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as SiteFlavorModule from "@/config/siteFlavor";

const { isEffectIndexMock, notFoundMock } = vi.hoisted(() => ({
  isEffectIndexMock: vi.fn(() => false),
  notFoundMock: vi.fn(() => {
    throw new Error("not-found");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/config/siteFlavor", async (importOriginal) => {
  const actual = await importOriginal<typeof SiteFlavorModule>();
  return { ...actual, isEffectIndex: isEffectIndexMock };
});

vi.mock("./ThemeLabWorkbench", () => ({
  ThemeLabWorkbench: vi.fn(() => null),
}));

import DevThemesPage from "./page";
import { ThemeLabWorkbench } from "./ThemeLabWorkbench";

describe("Palette Lab route access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isEffectIndexMock.mockReturnValue(false);
  });

  it("opens the tool without a session", async () => {
    const element = await DevThemesPage();

    expect(element.type).toBe(ThemeLabWorkbench);
  });

  it("does not exist on the Effect Index build", async () => {
    isEffectIndexMock.mockReturnValue(true);

    await expect(DevThemesPage()).rejects.toThrow("not-found");
  });
});
