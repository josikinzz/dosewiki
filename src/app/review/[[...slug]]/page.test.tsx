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

const { getEditorBrowserReadTargetMock, getEditorTargetAlignmentMock, getServerSessionMock } =
  vi.hoisted(() => ({
    getEditorBrowserReadTargetMock: vi.fn(),
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
  getProtectedRouteRedirectTarget: vi.fn((decision) => ({ type: decision.type })),
}));

vi.mock("../_components/ReviewRouteClient", () => ({
  ReviewRouteClient: vi.fn(() => null),
}));

import ReviewPage from "./page";
import {
  ConvexTargetSplitBanner,
  ConvexTargetSplitRefusal,
} from "../../_components/ConvexTargetSplitNotice";
import { ReviewRouteClient } from "../_components/ReviewRouteClient";

describe("ReviewPage Convex target alignment gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEditorTargetAlignmentMock.mockReturnValue(ALIGNED);
    getEditorBrowserReadTargetMock.mockReturnValue({ selectedUrl: "https://convex.test" });
    getServerSessionMock.mockResolvedValue({
      user: { email: "editor@example.com", role: "editor" },
    });
  });

  it("renders the workbench unchanged when both chains resolve to one deployment", async () => {
    const element = await ReviewPage({ params: Promise.resolve({ slug: ["2c-b"] }) });

    expect(element.type).toBe(ReviewRouteClient);
    expect(element.props).toMatchObject({
      convexUrl: "https://convex.test",
      initialSlug: "2c-b",
    });
  });

  it("refuses to render the workbench on a read/write split", async () => {
    getEditorTargetAlignmentMock.mockReturnValue(SPLIT);

    const element = await ReviewPage({ params: Promise.resolve({ slug: ["2c-b"] }) });

    expect(element.type).toBe(ConvexTargetSplitRefusal);
    expect(element.props).toMatchObject({ alignment: SPLIT, surface: "review workbench" });
    expect(getEditorBrowserReadTargetMock).not.toHaveBeenCalled();
  });

  it("renders the workbench under a banner when the split is acknowledged", async () => {
    getEditorTargetAlignmentMock.mockReturnValue({ ...SPLIT, overrideAcknowledged: true });

    const element = await ReviewPage({ params: Promise.resolve({ slug: [] }) });

    const children = element.props.children as Array<{ type: unknown }>;
    expect(children[0].type).toBe(ConvexTargetSplitBanner);
    expect(children[1].type).toBe(ReviewRouteClient);
  });

  it("leaves the read-only no-write-target posture alone", async () => {
    getEditorTargetAlignmentMock.mockReturnValue({
      status: "no-write-target",
      read: { deploymentName: "glad-minnow-656", sourceEnvVar: "NEXT_PUBLIC_CONVEX_URL" },
      write: { deploymentName: null, sourceEnvVar: null },
      overrideAcknowledged: false,
      summary: "read-only",
    });

    const element = await ReviewPage({ params: Promise.resolve({ slug: [] }) });

    expect(element.type).toBe(ReviewRouteClient);
  });
});
