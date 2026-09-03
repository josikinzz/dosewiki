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
    devContributors: "/dev/contributors",
  },
  buildNoIndexPageMetadata: vi.fn(() => ({})),
  getProtectedRouteRedirectTarget: vi.fn((decision) => ({ type: decision.type, href: `/${decision.type}` })),
}));

vi.mock("../_components/NextDevRouteClient", () => ({
  NextDevRouteClient: vi.fn(() => null),
}));

import NextDevPage from "./page";
import { DEV_TAB_REGISTRY } from "@/features/dev/pages/devTabRegistry";
import {
  ConvexTargetSplitBanner,
  ConvexTargetSplitRefusal,
} from "../../_components/ConvexTargetSplitNotice";
import { NextDevRouteClient } from "../_components/NextDevRouteClient";

describe("NextDevPage shell selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEditorTargetAlignmentMock.mockReturnValue(ALIGNED);
    getEditorBrowserReadTargetMock.mockReturnValue({ selectedUrl: "https://convex.test" });
  });

  it("mounts the one shell on Contributors for an authenticated non-editor", async () => {
    getServerSessionMock.mockResolvedValue({
      user: {
        email: "viewer@example.com",
        role: "viewer",
      },
    });
    getOwnedContributorProfileMock.mockResolvedValue({ key: "VIEWER" });

    const element = await NextDevPage({ params: Promise.resolve({ segments: ["contributors", "me"] }) });

    expect(element.type).toBe(NextDevRouteClient);
    expect(element.props).toEqual(
      expect.objectContaining({
        convexUrl: "https://convex.test",
        initialTab: "contributors",
        initialSlug: "me",
        initialProfileKey: "VIEWER",
      }),
    );
    await expect(element.props.ownedProfileKey).resolves.toBe("VIEWER");
  });

  it("refuses editor-only tabs to a non-editor before any shell is built", async () => {
    getServerSessionMock.mockResolvedValue({
      user: { email: "viewer@example.com", role: "viewer" },
    });

    await expect(NextDevPage({ params: Promise.resolve({ segments: ["articles"] }) })).rejects.toThrow(
      "redirect:/unauthorized",
    );
    expect(getEditorBrowserReadTargetMock).not.toHaveBeenCalled();
  });

  it("keeps editor users on the same shell for Contributors", async () => {
    getServerSessionMock.mockResolvedValue({
      user: {
        email: "editor@example.com",
        role: "editor",
      },
    });
    getOwnedContributorProfileMock.mockResolvedValue(null);

    const element = await NextDevPage({ params: Promise.resolve({ segments: ["contributors"] }) });

    expect(element.type).toBe(NextDevRouteClient);
    expect(element.props).toEqual(
      expect.objectContaining({
        convexUrl: "https://convex.test",
        initialProfileKey: "EDITOR",
        initialTab: "contributors",
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

    // The lookup is handed down unresolved, so the shell is built and returned
    // without ever waiting on the failing Convex read.
    expect(element.type).toBe(NextDevRouteClient);
    expect(element.props).toEqual(
      expect.objectContaining({
        initialProfileKey: "EDITOR",
      }),
    );

    // The rejection is absorbed into a `null` key before it reaches the client,
    // so the hook adopting it never sees a rejected promise, and the diagnostic
    // is still logged server-side.
    await expect(element.props.ownedProfileKey).resolves.toBeNull();
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

  describe("route resolution", () => {
    const asEditor = () => {
      getServerSessionMock.mockResolvedValue({
        user: { email: "editor@example.com", role: "editor" },
      });
      getOwnedContributorProfileMock.mockResolvedValue(null);
    };

    const shellTabs = DEV_TAB_REGISTRY.filter((tab) => tab.destination.kind === "shell");

    it.each(shellTabs.flatMap((tab) => [tab.id, ...tab.aliases].map((segment) => [segment, tab.id] as const)))(
      "resolves /dev/%s to the %s tab and keeps the slug",
      async (segment, id) => {
        asEditor();

        const bare = await NextDevPage({ params: Promise.resolve({ segments: [segment] }) });
        expect(bare.type).toBe(NextDevRouteClient);
        expect(bare.props).toEqual(expect.objectContaining({ initialTab: id, initialSlug: undefined }));

        const deep = await NextDevPage({ params: Promise.resolve({ segments: [segment, "lsd"] }) });
        expect(deep.props).toEqual(expect.objectContaining({ initialTab: id, initialSlug: "lsd" }));
      },
    );

    it("redirects the external review descriptor to its own route", async () => {
      asEditor();

      await expect(NextDevPage({ params: Promise.resolve({ segments: ["review"] }) })).rejects.toThrow(
        "redirect:/review",
      );
      await expect(NextDevPage({ params: Promise.resolve({ segments: ["review", "lsd"] }) })).rejects.toThrow(
        "redirect:/review/lsd",
      );
    });

    it("pins /dev/about onto Writing and falls back to articles for unknown tabs", async () => {
      asEditor();

      const about = await NextDevPage({ params: Promise.resolve({ segments: ["about"] }) });
      expect(about.props).toEqual(expect.objectContaining({ initialTab: "writing", initialSlug: "about" }));

      const unknown = await NextDevPage({ params: Promise.resolve({ segments: ["unknown-tab", "ketamine"] }) });
      expect(unknown.props).toEqual(expect.objectContaining({ initialTab: "articles", initialSlug: "ketamine" }));

      const root = await NextDevPage({ params: Promise.resolve({}) });
      expect(root.props).toEqual(expect.objectContaining({ initialTab: "articles", initialSlug: undefined }));
    });

    it("opens /dev/blog and /dev/writing?kind=blog on Writing with the blog filter", async () => {
      asEditor();

      const legacy = await NextDevPage({ params: Promise.resolve({ segments: ["blog", "first-post"] }) });
      expect(legacy.type).toBe(NextDevRouteClient);
      expect(legacy.props).toEqual(
        expect.objectContaining({ initialTab: "writing", initialSlug: "first-post", initialFilter: "blog" }),
      );

      const queried = await NextDevPage({
        params: Promise.resolve({ segments: ["writing"] }),
        searchParams: Promise.resolve({ kind: "blog" }),
      });
      expect(queried.props).toEqual(
        expect.objectContaining({ initialTab: "writing", initialSlug: undefined, initialFilter: "blog" }),
      );

      const plain = await NextDevPage({
        params: Promise.resolve({ segments: ["writing"] }),
        searchParams: Promise.resolve({ kind: "poem" }),
      });
      expect(plain.props).toEqual(expect.objectContaining({ initialTab: "writing", initialFilter: undefined }));
    });
  });
});
