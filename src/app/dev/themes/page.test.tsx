import { beforeEach, describe, expect, it, vi } from "vitest";

const { getServerSessionMock, redirectMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
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
  redirect: redirectMock,
}));

vi.mock("./ThemeLabWorkbench", () => ({
  ThemeLabWorkbench: vi.fn(() => null),
}));

import DevThemesPage from "./page";
import { ThemeLabWorkbench } from "./ThemeLabWorkbench";

describe("Theme Lab developer route access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
