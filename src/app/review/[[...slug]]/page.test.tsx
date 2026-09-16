import { beforeEach, describe, expect, it, vi } from "vitest";

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

const { getEditorTargetAlignmentMock, getServerSessionMock } =
  vi.hoisted(() => ({
    getEditorTargetAlignmentMock: vi.fn(),
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

vi.mock("@server/data/serverWriteHealth", () => ({
  getEditorTargetAlignment: getEditorTargetAlignmentMock,
}));

vi.mock("@server/next/statusRedirectPolicy", () => ({
  STATUS_PAGE_PATHS: {
    dev: "/dev",
  },
  buildNoIndexPageMetadata: vi.fn(() => ({})),
  getProtectedRouteRedirectTarget: vi.fn((decision) => ({ type: decision.type })),
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

});
