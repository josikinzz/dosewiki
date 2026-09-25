import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DevModePageControllerState } from "./devModePageTypes";
import { DEV_TAB_REGISTRY } from "./devTabRegistry";

const { tool } = vi.hoisted(() => ({
  tool: (name: string) => ({ [name]: () => <div data-testid="dev-tool">{name}</div> }),
}));

vi.mock("./DevModePageChrome", () => ({
  DevModePageChrome: () => <div>Chrome</div>,
  DevToolLoadingPanel: () => <div>Loading</div>,
}));

vi.mock("./DevModeChangeLogTab", () => tool("DevModeChangeLogTab"));
vi.mock("../tags", () => tool("TagEditorTab"));
vi.mock("../tools/writing/WritingTab", () => tool("WritingTab"));
vi.mock("../tools/copy-studio/CopyStudioTab", () => tool("CopyStudioTab"));
vi.mock("../tools/queue/QueueTab", () => tool("QueueTab"));
vi.mock("../tools/contributors/ContributorsTab", () => tool("ContributorsTab"));
vi.mock("../tools/playlists/PlaylistsTab", () => tool("PlaylistsTab"));
vi.mock("../tools/citation-review/CitationReviewTab", () => tool("CitationReviewTab"));
vi.mock("../tools/index-layout/IndexLayoutTab", () => tool("IndexLayoutTab"));
vi.mock("../tools/molecule-editor/MoleculeEditorTab", () => tool("MoleculeEditorTab"));
vi.mock("../tools/replication-studio/ReplicationStudioTab", () => tool("ReplicationStudioTab"));
vi.mock("../tools/warning-banners/WarningBannersTab", () => tool("WarningBannersTab"));
vi.mock("../tools/substance-editor/SubstanceEditorTab", () => tool("SubstanceEditorTab"));
vi.mock("../tools/feedback/FeedbackTab", () => tool("FeedbackTab"));
vi.mock("../tools/trip-report-portal/TripReportPortalTab", () => tool("TripReportPortalTab"));
vi.mock("../tools/members/MembersTab", () => tool("MembersTab"));
vi.mock("../tools/glossary/GlossaryTab", () => tool("GlossaryTab"));
vi.mock("../tools/my-reports/MyReportsTab", () => tool("MyReportsTab"));

import { DevModePageView } from "./DevModePageView";

function buildController(
  activeTab: DevModePageControllerState["activeTab"],
  activeTabLockReason: string | null = null,
  canApprove = true,
): DevModePageControllerState {
  return {
    activePrimaryTab: "tools",
    mainClassName: "",
    contentWrapperClass: "",
    enableStickyPanels: false,
    isSignedIn: true,
    role: "admin",
    canDraft: true,
    canApprove,
    activeTabLockReason,
    sessionStatus: "authenticated",
    articlesLength: 0,
    isLibraryLoading: false,
    indexLayoutsReadiness: { status: "ready", error: null },
    retryIndexLayouts: vi.fn(),
    activeTab,
    changeLog: {},
    commitPanel: null,
    renderCommitPanel: () => null,
    tagEditorTabProps: {},
    sessionProfileKey: "EDITOR",
    contributorDirectory: { profiles: [], isLoading: false },
    onPrimaryTabChange: vi.fn(),
    onTabChange: vi.fn(),
    onSignIn: vi.fn(),
  } as unknown as DevModePageControllerState;
}

describe("DevModePageView", () => {
  const shellTabs = DEV_TAB_REGISTRY.filter((tab) => tab.destination.kind === "shell");

  it.each(shellTabs.map((tab) => [tab.id] as const))("renders a tool for the %s descriptor", async (id) => {
    const { findByTestId } = render(<DevModePageView controller={buildController(id)} />);

    // A descriptor without a render branch falls through to `null`; a branch
    // renders its (mocked) lazy tool once the chunk resolves.
    expect(await findByTestId("dev-tool")).toBeTruthy();
  });

  it("states the record model on Substances, not the commit flow it does not have", async () => {
    const { findByTestId, getByText, queryByText } = render(
      <DevModePageView controller={buildController("articles")} />,
    );
    await findByTestId("dev-tool");

    expect(getByText("Save draft stays private. Publish goes live.")).toBeTruthy();
    expect(queryByText(/Apply to draft|commit/i)).toBeNull();
  });

  it("says a non-admin's Substances edits go to review", async () => {
    const { findByTestId, getByText } = render(
      <DevModePageView controller={buildController("articles", null, false)} />,
    );
    await findByTestId("dev-tool");

    expect(getByText("Submit for review. An admin publishes approved changes.")).toBeTruthy();
  });

  it("puts a live-write save line in the warning tone", async () => {
    const { findByTestId, getByText } = render(<DevModePageView controller={buildController("members")} />);
    await findByTestId("dev-tool");

    const line = getByText("Each save goes live right away.");
    expect(line.closest("[data-badge-tone]")?.getAttribute("data-badge-tone")).toBe("yellow");
  });

  it("names the commit step for a batch tool", async () => {
    const { findByTestId, getByText } = render(<DevModePageView controller={buildController("tag-editor")} />);
    await findByTestId("dev-tool");

    expect(getByText("Edits collect in your draft. Commit sends them live.")).toBeTruthy();
  });

  it("leaves the save line to tools that draw it beside their own primary action", async () => {
    for (const id of ["replications", "queue"] as const) {
      const { findByTestId, queryByText, unmount } = render(<DevModePageView controller={buildController(id)} />);
      await findByTestId("dev-tool");
      expect(queryByText(/goes live|for review|Commit sends/)).toBeNull();
      unmount();
    }
  });

  it("renders the review descriptor nowhere in the shell", () => {
    const { queryByTestId, queryByText } = render(<DevModePageView controller={buildController("review")} />);

    expect(queryByTestId("dev-tool")).toBeNull();
    expect(queryByText("Loading")).toBeNull();
    expect(queryByText(/goes live|for review|Commit sends/)).toBeNull();
  });


  it("renders the locked panel instead of the tool when the settled session is below the tab's role", () => {
    const { getByText, queryByTestId } = render(
      <DevModePageView controller={buildController("banners", "Admin role required")} />,
    );

    expect(getByText("Admin role required")).toBeTruthy();
    expect(getByText(/Banners is closed to your role/)).toBeTruthy();
    expect(queryByTestId("dev-tool")).toBeNull();
  });
});
