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

const { getEditorTargetAlignmentMock, getServerSessionMock, requestHeaders } =
  vi.hoisted(() => ({
    getEditorTargetAlignmentMock: vi.fn(),
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

vi.mock("../_components/ReviewRouteClient", () => ({
  ReviewRouteClient: vi.fn(() => null),
}));

import ReviewPage from "./page";
import {
  DataTargetSplitRefusal,
} from "../../_components/DataTargetSplitNotice";
import { ReviewRouteClient } from "../_components/ReviewRouteClient";

describe("ReviewPage Postgres target alignment gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEditorTargetAlignmentMock.mockReturnValue(ALIGNED);
    getServerSessionMock.mockResolvedValue({
      user: { email: "editor@example.com", role: "editor" },
    });
  });

  it("renders the workbench unchanged when both chains resolve to one deployment", async () => {
    const element = await ReviewPage({ params: Promise.resolve({ slug: ["2c-b"] }) });

    expect(element.type).toBe(ReviewRouteClient);
    expect(element.props).toEqual({ initialSlug: "2c-b" });
  });

  it("refuses to render the workbench on a read/write split", async () => {
    getEditorTargetAlignmentMock.mockReturnValue(SPLIT);

    const element = await ReviewPage({ params: Promise.resolve({ slug: ["2c-b"] }) });

    expect(element.type).toBe(DataTargetSplitRefusal);
    expect(element.props).toMatchObject({ alignment: SPLIT, surface: "review workbench" });
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

    it("renders the workbench without a session under the same gate as /dev", async () => {
      const element = await ReviewPage({ params: Promise.resolve({ slug: ["lsd"] }) });
      expect(element.type).toBe(ReviewRouteClient);
    });

    it.each([
      ["NODE_ENV is production", { NODE_ENV: "production" }],
      ["the opt-in is unset", { DEV_SCREENSHOT_VIEWER: undefined }],
      ["the write freeze is off", { DATA_WRITES_FROZEN: undefined }],
    ])("sends a visitor without a session to sign in when %s", async (_label, overrides) => {
      for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
      await expect(ReviewPage({ params: Promise.resolve({ slug: ["lsd"] }) })).rejects.toThrow("redirect:/sign-in");
    });

    it("sends a visitor without a session to sign in from a non-loopback host", async () => {
      requestHeaders.current = new Headers({ host: "dev.dose.wiki" });
      await expect(ReviewPage({ params: Promise.resolve({ slug: ["lsd"] }) })).rejects.toThrow("redirect:/sign-in");
    });
  });
});
