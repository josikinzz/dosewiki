import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getEditorBrowserReadTargetMock,
  getOwnedContributorProfileMock,
  getServerSessionMock,
} = vi.hoisted(() => ({
  getEditorBrowserReadTargetMock: vi.fn(() => ({ selectedUrl: "https://convex.test" })),
  getOwnedContributorProfileMock: vi.fn(),
  getServerSessionMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock("@auth", () => ({
  authOptions: {},
}));

vi.mock("@server/convex/publicData", () => ({
  getOwnedContributorProfile: getOwnedContributorProfileMock,
}));

vi.mock("@server/convex/serverWriteHealth", () => ({
  getEditorBrowserReadTarget: getEditorBrowserReadTargetMock,
}));

vi.mock("@server/next/statusRedirectPolicy", () => ({
  STATUS_PAGE_PATHS: {
    dev: "/dev",
    devProfile: "/dev/profile",
  },
  buildNoIndexPageMetadata: vi.fn(() => ({})),
  getProtectedRouteRedirectTarget: vi.fn((decision) => ({ type: decision.type })),
}));

vi.mock("../_components/NextDevRouteClient", () => ({
  NextDevRouteClient: vi.fn(() => null),
}));

vi.mock("../_components/NextDevProfileRouteClient", () => ({
  NextDevProfileRouteClient: vi.fn(() => null),
}));

import NextDevPage from "./page";
import { NextDevProfileRouteClient } from "../_components/NextDevProfileRouteClient";
import { NextDevRouteClient } from "../_components/NextDevRouteClient";

describe("NextDevPage shell selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the profile-only shell for authenticated non-editor profile access", async () => {
    getServerSessionMock.mockResolvedValue({
      user: {
        email: "viewer@example.com",
        role: "viewer",
      },
    });
    getOwnedContributorProfileMock.mockResolvedValue({ key: "VIEWER" });

    const element = await NextDevPage({ params: Promise.resolve({ segments: ["profile"] }) });

    expect(element.type).toBe(NextDevProfileRouteClient);
    expect(element.props).toEqual(
      expect.objectContaining({
        initialProfileKey: "VIEWER",
      }),
    );
    expect(getEditorBrowserReadTargetMock).not.toHaveBeenCalled();
  });

  it("keeps editor users on the full editor shell", async () => {
    getServerSessionMock.mockResolvedValue({
      user: {
        email: "editor@example.com",
        role: "editor",
      },
    });
    getOwnedContributorProfileMock.mockResolvedValue(null);

    const element = await NextDevPage({ params: Promise.resolve({ segments: ["profile"] }) });

    expect(element.type).toBe(NextDevRouteClient);
    expect(element.props).toEqual(
      expect.objectContaining({
        convexUrl: "https://convex.test",
        initialProfileKey: "EDITOR",
        initialTab: "profile",
      }),
    );
  });

  it("renders the editor shell when the owned-profile lookup fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getServerSessionMock.mockResolvedValue({
      user: {
        email: "editor@example.com",
        role: "editor",
      },
    });
    getOwnedContributorProfileMock.mockRejectedValue(new Error("Convex credential rejected"));

    const element = await NextDevPage({ params: Promise.resolve({ segments: [] }) });

    expect(element.type).toBe(NextDevRouteClient);
    expect(element.props).toEqual(
      expect.objectContaining({
        initialProfileKey: "EDITOR",
      }),
    );
    expect(consoleError).toHaveBeenCalledWith(
      "Unable to resolve the owned contributor profile; rendering the /dev shell without it.",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
