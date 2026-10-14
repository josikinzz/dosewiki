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
import { DataTargetSplitRefusal } from "../../_components/DataTargetSplitNotice";

describe("NextDevPage shell selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEditorTargetAlignmentMock.mockReturnValue(ALIGNED);
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
});
