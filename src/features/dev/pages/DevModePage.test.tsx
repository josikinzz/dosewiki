import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  sessionState,
  onTabChangeMock,
  libraryState,
  contributorProfilesState,
  devModeState,
  changeLogState,
  changelogState,
  saveActionsState,
  supportTabPropsState,
} = vi.hoisted(() => ({
  sessionState: {
    status: "unauthenticated",
    data: null as
      | null
      | {
          user?: {
            email?: string;
            name?: string;
            image?: string;
            role?: string;
          };
        },
  },
  onTabChangeMock: vi.fn(),
  libraryState: {
    chemicalClassIndexGroups: [],
    dosageCategoryGroups: [],
    effectSummaries: [],
    mechanismIndexGroups: [],
    substanceRecords: [{ slug: "lsd" }],
  },
  contributorProfilesState: {
    profiles: [],
  },
  devModeState: {
    articles: [{ slug: "lsd" }],
    // The shell's surfaces are all exercised post-drain, so the corpus reports
    // itself whole. Inlined rather than imported: this object is built inside a
    // hoisted mock factory, which runs before module imports resolve.
    articleHydration: {
      hydratedSlugs: new Set<string>(),
      isArticleHydrated: () => true,
      requestArticle: vi.fn(),
    },
    psychoactiveIndexManual: {},
    chemicalIndexManual: {},
    mechanismIndexManual: {},
    close: vi.fn(),
    getOriginalArticles: vi.fn(() => []),
    getOriginalPsychoactiveIndexManual: vi.fn(() => ({})),
    getOriginalChemicalIndexManual: vi.fn(() => ({})),
    getOriginalMechanismIndexManual: vi.fn(() => ({})),
    markChangesSaved: vi.fn(),
  },
  changeLogState: {
    clearNotice: vi.fn(),
    pushNotice: vi.fn(),
  },
  changelogState: {
    datasetChangelog: {},
    psychoactiveManualChangelog: {},
    chemicalManualChangelog: {},
    mechanismManualChangelog: {},
    hasPendingChanges: false,
    combinedChangelogMarkdown: "",
  },
  saveActionsState: {
    commitPanel: null,
    renderCommitPanel: () => null,
    clearSaveNotices: vi.fn(),
  },
  supportTabPropsState: {
    tagEditorTabProps: {},
  },
}));

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => sessionState,
}));

vi.mock("@/data/SubstanceIndexProvider", () => ({
  useLibrary: () => libraryState,
}));

vi.mock("@/hooks/useContributorProfiles", () => ({
  useContributorProfiles: () => contributorProfilesState,
}));

vi.mock("@/lib/convex", () => ({
  isConvexEnabled: () => false,
}));

vi.mock("../context/DevModeContext", () => ({
  useDevMode: () => devModeState,
}));

vi.mock("./useDevModeChangeLog", () => ({
  useDevModeChangeLog: () => changeLogState,
}));

vi.mock("./useDevModeChangelogState", () => ({
  useDevModeChangelogState: () => changelogState,
}));

vi.mock("./useDevModeSaveActions", () => ({
  useDevModeSaveActions: () => saveActionsState,
}));

vi.mock("./useDevModeSupportTabProps", () => ({
  useDevSupportTabsController: () => supportTabPropsState,
}));

vi.mock("./DevModePageChrome", () => ({
  DevModePageChrome: () => <div>Chrome</div>,
  DevToolLoadingPanel: () => <div>Loading</div>,
}));

vi.mock("../tools/index-layout/IndexLayoutTab", () => ({
  IndexLayoutTab: () => <div>Index Layout</div>,
}));

vi.mock("../tools/substance-editor/SubstanceEditorTab", () => ({
  SubstanceEditorTab: () => <div>Substance Editor</div>,
}));

vi.mock("../tags", () => ({
  TagEditorTab: () => <div>Tags</div>,
}));

vi.mock("./DevModeChangeLogTab", () => ({
  DevModeChangeLogTab: () => <div>Change Log</div>,
}));

import { DevModePage } from "./DevModePage";

describe("DevModePage", () => {
  beforeEach(() => {
    onTabChangeMock.mockReset();
    sessionState.status = "unauthenticated";
    sessionState.data = null;
  });

  it("swaps an editor-only tool for its locked panel once a signed-out session settles", async () => {
    const { getByText, queryByText } = render(
      <DevModePage activeTab="articles" onTabChange={onTabChangeMock} />,
    );

    await waitFor(() => {
      expect(getByText("Sign in required")).toBeInTheDocument();
    });
    expect(queryByText("Substance Editor")).not.toBeInTheDocument();
    expect(onTabChangeMock).not.toHaveBeenCalled();
  });

  it("locks an admin tool for an editor with the admin reason and never loads the tool", () => {
    sessionState.status = "authenticated";
    sessionState.data = { user: { email: "editor@example.com", role: "editor" } };

    const { getByText } = render(<DevModePage activeTab="banners" onTabChange={onTabChangeMock} />);

    expect(getByText("Chrome")).toBeInTheDocument();
    expect(getByText("Admin role required")).toBeInTheDocument();
    expect(getByText(/Banners is closed to your role/)).toBeInTheDocument();
    expect(onTabChangeMock).not.toHaveBeenCalled();
  });

  it("mounts the same shell for a contributor session on Contributors", () => {
    sessionState.status = "authenticated";
    sessionState.data = { user: { email: "reader@example.com", role: "contributor" } };

    const { getByText, queryByText } = render(
      <DevModePage activeTab="contributors" onTabChange={onTabChangeMock} />,
    );

    expect(getByText("Chrome")).toBeInTheDocument();
    expect(queryByText(/role required/)).not.toBeInTheDocument();
    expect(onTabChangeMock).not.toHaveBeenCalled();
  });
});
