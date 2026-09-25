import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ALIGNED = {
  status: "aligned" as const,
  read: { deploymentName: "db.example/dosewiki", sourceEnvVar: "POSTGRES_POOLED_URL" },
  write: { deploymentName: "db.example/dosewiki", sourceEnvVar: "POSTGRES_DIRECT_URL" },
  summary: "aligned",
};

const SPLIT = {
  status: "split" as const,
  read: { deploymentName: "db.example/dosewiki", sourceEnvVar: "POSTGRES_POOLED_URL" },
  write: { deploymentName: "db.example/other", sourceEnvVar: "POSTGRES_DIRECT_URL" },
  summary: "split",
};

const {
  getEditorTargetAlignmentMock,
  getOwnedContributorProfileMock,
  getServerSessionMock,
  requestHeaders,
} = vi.hoisted(() => ({
  getEditorTargetAlignmentMock: vi.fn(),
  getOwnedContributorProfileMock: vi.fn(),
  getServerSessionMock: vi.fn(),
  requestHeaders: { current: new Headers({ host: "127.0.0.1:3100" }) },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => requestHeaders.current),
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

vi.mock("@server/data/publicData.contributors", () => ({
  getOwnedContributorProfileKey: getOwnedContributorProfileMock,
}));

vi.mock("@server/data/serverWriteHealth", () => ({
  getEditorTargetAlignment: getEditorTargetAlignmentMock,
}));

vi.mock("@server/next/statusRedirectPolicy", () => ({
  STATUS_PAGE_PATHS: {
    dev: "/dev",
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
  DataTargetSplitRefusal,
} from "../../_components/DataTargetSplitNotice";
import { NextDevRouteClient } from "../_components/NextDevRouteClient";

describe("NextDevPage shell selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEditorTargetAlignmentMock.mockReturnValue(ALIGNED);
  });

  it("mounts the one shell on Contributors for an authenticated contributor", async () => {
    getServerSessionMock.mockResolvedValue({
      user: {
        email: "member@example.com",
        role: "contributor",
      },
    });
    getOwnedContributorProfileMock.mockResolvedValue("MEMBER");

    const element = await NextDevPage({ params: Promise.resolve({ segments: ["contributors", "me"] }) });

    expect(element.type).toBe(NextDevRouteClient);
    expect(element.props).toEqual(
      expect.objectContaining({
        initialTab: "contributors",
        initialSlug: "me",
        initialProfileKey: "MEMBER",
      }),
    );
    await expect(element.props.ownedProfileKey).resolves.toBe("MEMBER");
  });

  it.each(["admin", "editor", "editor_translator", "translator", "contributor"] as const)(
    "opens bare /dev on the Home for a %s, with no redirect",
    async (role) => {
      getServerSessionMock.mockResolvedValue({ user: { email: "member@example.com", role } });
      getOwnedContributorProfileMock.mockResolvedValue(null);

      const element = await NextDevPage({ params: Promise.resolve({ segments: [] }) });
      expect(element.type).toBe(NextDevRouteClient);
      expect(element.props).toEqual(expect.objectContaining({ initialTab: "home", initialSlug: undefined }));
    },
  );

  it("still loads the shell for a contributor on an editor tab, which the shell renders locked", async () => {
    getServerSessionMock.mockResolvedValue({
      user: { email: "member@example.com", role: "contributor" },
    });
    getOwnedContributorProfileMock.mockResolvedValue(null);

    const element = await NextDevPage({ params: Promise.resolve({ segments: ["articles"] }) });

    expect(element.type).toBe(NextDevRouteClient);
    expect(element.props).toEqual(expect.objectContaining({ initialTab: "articles" }));
  });

  it("refuses a viewer account any tab before any shell is built", async () => {
    getServerSessionMock.mockResolvedValue({
      user: { email: "viewer@example.com", role: "viewer" },
    });

    for (const segments of [["articles"], ["contributors", "me"]]) {
      await expect(NextDevPage({ params: Promise.resolve({ segments }) })).rejects.toThrow(
        "redirect:/unauthorized",
      );
    }
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
    getOwnedContributorProfileMock.mockRejectedValue(new Error("Postgres credential rejected"));

    const element = await NextDevPage({ params: Promise.resolve({ segments: [] }) });

    // The lookup is handed down unresolved, so the shell is built and returned
    // without ever waiting on the failing Postgres read.
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

    expect(element.type).toBe(DataTargetSplitRefusal);
    expect(element.props).toMatchObject({ alignment: SPLIT, surface: "/dev editor shell" });
    // The shell is never constructed, so no Postgres round-trip is made on a split.
    expect(getOwnedContributorProfileMock).not.toHaveBeenCalled();
  });


  describe("local screenshot viewer", () => {
    const VIEWER_ENV = ["NODE_ENV", "DEV_SCREENSHOT_VIEWER", "DATA_WRITES_FROZEN"] as const;
    let previous: Record<string, string | undefined> = {};

    beforeEach(() => {
      previous = Object.fromEntries(VIEWER_ENV.map((key) => [key, process.env[key]]));
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("DEV_SCREENSHOT_VIEWER", "1");
      vi.stubEnv("DATA_WRITES_FROZEN", "1");
      requestHeaders.current = new Headers({ host: "127.0.0.1:3100" });
      getServerSessionMock.mockResolvedValue(null);
    });

    afterEach(() => {
      for (const key of VIEWER_ENV) vi.stubEnv(key, previous[key]);
    });

    it("renders the shell without a session and skips the private profile read", async () => {
      const element = await NextDevPage({ params: Promise.resolve({ segments: ["replications"] }) });

      expect(element.type).toBe(NextDevRouteClient);
      expect(element.props).toEqual(expect.objectContaining({ initialTab: "replications", ownedProfileKey: undefined }));
      expect(getOwnedContributorProfileMock).not.toHaveBeenCalled();
    });

    it.each([
      ["NODE_ENV is production", { NODE_ENV: "production" }],
      ["the opt-in is unset", { DEV_SCREENSHOT_VIEWER: undefined }],
      ["the write freeze is off", { DATA_WRITES_FROZEN: undefined }],
    ])("redirects to sign-in when %s", async (_label, overrides) => {
      for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
      await expect(NextDevPage({ params: Promise.resolve({ segments: ["replications"] }) })).rejects.toThrow(
        "redirect:/sign-in",
      );
    });

    it("redirects to sign-in for a non-loopback host", async () => {
      requestHeaders.current = new Headers({ host: "dev.dose.wiki" });
      await expect(NextDevPage({ params: Promise.resolve({ segments: ["replications"] }) })).rejects.toThrow(
        "redirect:/sign-in",
      );
    });

    it("never replaces a real session", async () => {
      getServerSessionMock.mockResolvedValue({ user: { email: "member@example.com", role: "contributor" } });
      getOwnedContributorProfileMock.mockResolvedValue("MEMBER");
      const element = await NextDevPage({ params: Promise.resolve({ segments: ["replications"] }) });
      expect(element.props).toEqual(expect.objectContaining({ initialProfileKey: "MEMBER" }));
      expect(getOwnedContributorProfileMock).toHaveBeenCalledWith("member@example.com");
    });
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

    it("pins /dev/about onto Writing, falls back to articles for unknown tabs, and opens Home at the root", async () => {
      asEditor();

      const about = await NextDevPage({ params: Promise.resolve({ segments: ["about"] }) });
      expect(about.props).toEqual(expect.objectContaining({ initialTab: "writing", initialSlug: "about" }));

      const unknown = await NextDevPage({ params: Promise.resolve({ segments: ["unknown-tab", "ketamine"] }) });
      expect(unknown.props).toEqual(expect.objectContaining({ initialTab: "articles", initialSlug: "ketamine" }));

      const root = await NextDevPage({ params: Promise.resolve({}) });
      expect(root.props).toEqual(expect.objectContaining({ initialTab: "home", initialSlug: undefined }));
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
