import { beforeEach, describe, expect, it, vi } from "vitest";

const ALIGNED = {
  status: "aligned" as const,
  read: { deploymentName: "glad-minnow-656", sourceEnvVar: "NEXT_PUBLIC_CONVEX_URL" },
  write: { deploymentName: "glad-minnow-656", sourceEnvVar: "CONVEX_URL" },
  overrideAcknowledged: false,
  summary: "aligned",
};

const SPLIT = {
  status: "split" as const,
  read: { deploymentName: "glad-minnow-656", sourceEnvVar: "NEXT_PUBLIC_CONVEX_URL" },
  write: { deploymentName: "enchanted-echidna-791", sourceEnvVar: "VITE_CONVEX_URL" },
  overrideAcknowledged: false,
  summary: "split",
};

const {
  getEditorBrowserReadTargetMock,
  getEditorTargetAlignmentMock,
  getOwnedContributorProfileMock,
  getServerSessionMock,
} = vi.hoisted(() => ({
  getEditorBrowserReadTargetMock: vi.fn(() => ({ selectedUrl: "https://convex.test" })),
  getEditorTargetAlignmentMock: vi.fn(),
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
  CONVEX_TARGET_SPLIT_OVERRIDE_ENV_VAR: "CONVEX_ALLOW_TARGET_SPLIT",
  getEditorBrowserReadTarget: getEditorBrowserReadTargetMock,
  getEditorTargetAlignment: getEditorTargetAlignmentMock,
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
import {
  ConvexTargetSplitBanner,
  ConvexTargetSplitRefusal,
} from "../../_components/ConvexTargetSplitNotice";
import { NextDevProfileRouteClient } from "../_components/NextDevProfileRouteClient";
import { NextDevRouteClient } from "../_components/NextDevRouteClient";

describe("NextDevPage shell selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEditorTargetAlignmentMock.mockReturnValue(ALIGNED);
    getEditorBrowserReadTargetMock.mockReturnValue({ selectedUrl: "https://convex.test" });
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

  it("refuses to render the shell when reads and writes target different deployments", async () => {
    getEditorTargetAlignmentMock.mockReturnValue(SPLIT);
    getServerSessionMock.mockResolvedValue({
      user: { email: "editor@example.com", role: "editor" },
    });

    const element = await NextDevPage({ params: Promise.resolve({ segments: [] }) });

    expect(element.type).toBe(ConvexTargetSplitRefusal);
    expect(element.props).toMatchObject({ alignment: SPLIT, surface: "/dev editor shell" });
    // The shell is never constructed, so no browser read URL is resolved and no
    // Convex round-trip is made on a split.
    expect(getEditorBrowserReadTargetMock).not.toHaveBeenCalled();
    expect(getOwnedContributorProfileMock).not.toHaveBeenCalled();
  });

  it("renders the shell under a permanent banner once the split is explicitly acknowledged", async () => {
    getEditorTargetAlignmentMock.mockReturnValue({ ...SPLIT, overrideAcknowledged: true });
    getServerSessionMock.mockResolvedValue({
      user: { email: "editor@example.com", role: "editor" },
    });
    getOwnedContributorProfileMock.mockResolvedValue(null);

    const element = await NextDevPage({ params: Promise.resolve({ segments: [] }) });

    const children = element.props.children as Array<{ type: unknown }>;
    expect(children[0].type).toBe(ConvexTargetSplitBanner);
    expect(children[1].type).toBe(NextDevRouteClient);
  });

  it("does not warn when the deployment has no write target at all", async () => {
    getEditorTargetAlignmentMock.mockReturnValue({
      status: "no-write-target",
      read: { deploymentName: "glad-minnow-656", sourceEnvVar: "NEXT_PUBLIC_CONVEX_URL" },
      write: { deploymentName: null, sourceEnvVar: null },
      overrideAcknowledged: false,
      summary: "read-only",
    });
    getServerSessionMock.mockResolvedValue({
      user: { email: "editor@example.com", role: "editor" },
    });
    getOwnedContributorProfileMock.mockResolvedValue(null);

    const element = await NextDevPage({ params: Promise.resolve({ segments: [] }) });

    expect(element.type).toBe(NextDevRouteClient);
  });
});
