import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  sessionState,
  verifyDevCredentialsMock,
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
  verifyDevCredentialsMock: vi.fn().mockResolvedValue(undefined),
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
    psychoactiveIndexManual: {},
    chemicalIndexManual: {},
    mechanismIndexManual: {},
    aboutMarkdown: "",
    aboutSubtitle: "",
    aboutFounderKeys: [],
    close: vi.fn(),
    getOriginalArticles: vi.fn(() => []),
    getOriginalPsychoactiveIndexManual: vi.fn(() => ({})),
    getOriginalChemicalIndexManual: vi.fn(() => ({})),
    getOriginalMechanismIndexManual: vi.fn(() => ({})),
    getOriginalAboutMarkdown: vi.fn(() => ""),
    getOriginalAboutSubtitle: vi.fn(() => ""),
    getOriginalAboutFounderKeys: vi.fn(() => []),
    replaceAboutMarkdown: vi.fn(),
    resetAboutMarkdown: vi.fn(),
    replaceAboutSubtitle: vi.fn(),
    resetAboutSubtitle: vi.fn(),
    replaceAboutFounderKeys: vi.fn(),
    resetAboutFounderKeys: vi.fn(),
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
    aboutMarkdownChangelog: { markdown: "", hasChanges: false },
    aboutSubtitleChangelog: { markdown: "", hasChanges: false },
    aboutFounderChangelog: {},
    hasAboutMarkdownChanges: false,
    hasAboutSubtitleChanges: false,
    hasAboutFounderChanges: false,
    hasPendingChanges: false,
    combinedChangelogMarkdown: "",
    originalAboutMarkdown: "",
    originalAboutSubtitle: "",
    originalAboutFounderKeys: [],
  },
  saveActionsState: {
    passwordKey: "",
    setPasswordKey: vi.fn(),
    verifyDevCredentials: vi.fn().mockResolvedValue(undefined),
    commitPanel: null,
    renderCommitPanel: () => null,
    clearSaveNotices: vi.fn(),
  },
  supportTabPropsState: {
    profileTabProps: {},
    aboutTabProps: {},
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

vi.mock("@/lib/auth/roles", () => ({
  canAccessDev: (role?: string) => role === "admin" || role === "editor",
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
  useDevModeSaveActions: () => ({
    ...saveActionsState,
    verifyDevCredentials: verifyDevCredentialsMock,
  }),
}));

vi.mock("./useDevModeSupportTabProps", () => ({
  useDevModeSupportTabProps: () => supportTabPropsState,
  useDevSupportTabsController: () => supportTabPropsState,
}));

vi.mock("./DevModePageChrome", () => ({
  DevModePageChrome: () => <div>Chrome</div>,
  DevModePageLoadingState: () => <div>Loading</div>,
  DevToolLoadingPanel: () => <div>Loading</div>,
}));

vi.mock("../tools/about/AboutEditorTab", () => ({
  AboutEditorTab: () => <div>About</div>,
}));

vi.mock("../tools/index-layout/IndexLayoutTab", () => ({
  IndexLayoutTab: () => <div>Index Layout</div>,
}));

vi.mock("../tools/substance-editor/SubstanceEditorTab", () => ({
  SubstanceEditorTab: () => <div>Substance Editor</div>,
}));

vi.mock("../profile", () => ({
  ProfileEditorTab: () => <div>Profile</div>,
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
    verifyDevCredentialsMock.mockClear();
    sessionState.status = "unauthenticated";
    sessionState.data = null;
  });

  it("redirects protected tabs to profile when the user lacks an editor session", async () => {
    render(<DevModePage activeTab="articles" onTabChange={onTabChangeMock} />);

    await waitFor(() => {
      expect(onTabChangeMock).toHaveBeenCalledWith("profile");
    });
  });

  it("redirects profile back to articles when the user is unauthenticated", async () => {
    render(<DevModePage activeTab="profile" onTabChange={onTabChangeMock} />);

    await waitFor(() => {
      expect(onTabChangeMock).toHaveBeenCalledWith("articles");
    });
    expect(verifyDevCredentialsMock).not.toHaveBeenCalled();
  });
});
