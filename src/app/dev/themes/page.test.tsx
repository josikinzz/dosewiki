import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as SiteFlavorModule from "@/config/siteFlavor";

const { getServerSessionMock, isEffectIndexMock, notFoundMock, redirectMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  isEffectIndexMock: vi.fn(() => false),
  notFoundMock: vi.fn(() => {
    throw new Error("not-found");
  }),
  redirectMock: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@auth", () => ({
  authOptions: {},
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
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

describe("Theme Lab developer route access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isEffectIndexMock.mockReturnValue(false);
  });

  it("sends an anonymous request to sign-in", async () => {
    getServerSessionMock.mockResolvedValue(null);

    await expect(DevThemesPage()).rejects.toThrow("redirect:/sign-in?callbackUrl=%2Fdev");
  });

  it("sends a signed-in viewer to unauthorized", async () => {
    getServerSessionMock.mockResolvedValue({
      user: { email: "viewer@example.com", role: "viewer" },
    });

    await expect(DevThemesPage()).rejects.toThrow("redirect:/unauthorized?from=%2Fdev");
  });

  it("opens the workbench for developer roles", async () => {
    for (const role of ["editor", "admin"] as const) {
      getServerSessionMock.mockResolvedValue({ user: { email: `${role}@example.com`, role } });

      const element = await DevThemesPage();

      expect(element.type, role).toBe(ThemeLabWorkbench);
    }
  });

  it("does not exist on the Effect Index build, and reads no session there", async () => {
    isEffectIndexMock.mockReturnValue(true);
    getServerSessionMock.mockResolvedValue({
      user: { email: "admin@example.com", role: "admin" },
    });

    await expect(DevThemesPage()).rejects.toThrow("not-found");
    expect(getServerSessionMock).not.toHaveBeenCalled();
  });
});
