import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorServerConfigHealth } from "@/hooks/useEditorServerConfigHealth";
import { buildDevSaveDraft } from "./devSaveCommand";

const {
  saveArticlesMutateAsyncMock,
  saveToConvexMutateAsyncMock,
} = vi.hoisted(() => ({
  saveArticlesMutateAsyncMock: vi.fn(),
  saveToConvexMutateAsyncMock: vi.fn(),
}));

vi.mock("@/hooks/useApiMutations", () => ({
  useSaveArticlesMutation: () => ({
    mutateAsync: saveArticlesMutateAsyncMock,
    isPending: false,
  }),
  useSaveToConvexMutation: () => ({
    mutateAsync: saveToConvexMutateAsyncMock,
  }),
}));

import { useDevModeSaveOperations } from "./useDevModeSaveOperations";

function createArgs(overrides: Partial<Parameters<typeof useDevModeSaveOperations>[0]> = {}) {
  const convexServerHealth: EditorServerConfigHealth = {
    status: "healthy",
    canSaveToConvex: true,
    issues: [],
    summary: "Server ready",
    checkedAt: null,
    isRefreshing: false,
  };

  return {
    draft: buildDevSaveDraft({
      articles: [{ id: 1, title: "LSD" }] as never[],
      originalArticles: [{ id: 1, title: "LSD" }] as never[],
      psychoactiveIndexManual: {},
      aboutMarkdown: "",
      aboutSubtitle: "",
      aboutFounderKeys: [],
      generatorPrompt: "",
      convexEnabled: true,
      datasetChangelog: {
        markdown: "# Changes\n\n+ LSD",
        articles: [{ id: 1, title: "LSD", slug: "lsd" }],
        sections: [{ index: 0, heading: "LSD", markdown: "# Changes\n\n+ LSD" }],
      },
      psychoactiveManualChangelog: { markdown: "", hasChanges: false },
      aboutMarkdownChangelog: { markdown: "", hasChanges: false },
      aboutSubtitleChangelog: { markdown: "", hasChanges: false },
      aboutFounderChangelog: { markdown: "", hasChanges: false },
      hasAboutMarkdownChanges: false,
      hasAboutSubtitleChanges: false,
      hasAboutFounderChanges: false,
      hasGeneratorPromptChanges: false,
      hasPendingChanges: true,
    }),
    markChangesSaved: vi.fn(),
    convexServerHealth,
    verifyDevCredentials: vi.fn().mockResolvedValue({
      username: "editor",
      password: "secret",
      key: "JOSIE",
    }),
    setPasswordKey: vi.fn(),
    setGithubNotice: vi.fn(),
    setConvexNotice: vi.fn(),
    onAppendChangeLogEntry: vi.fn(),
    onTabChange: vi.fn(),
    pushChangeLogNotice: vi.fn(),
    ...overrides,
  };
}

describe("useDevModeSaveOperations", () => {
  beforeEach(() => {
    saveArticlesMutateAsyncMock.mockReset();
    saveToConvexMutateAsyncMock.mockReset();
  });

  it("reports a GitHub notice when there are no pending changes to commit", async () => {
    const args = createArgs();
    args.draft.hasPendingChanges = false;

    const { result } = renderHook(() => useDevModeSaveOperations(args));

    await act(async () => {
      await result.current.handleSaveToGitHub();
    });

    expect(args.setGithubNotice).toHaveBeenCalledWith(
      { type: "error", message: "No changes detected to commit." },
      { clearAfterMs: 5000 },
    );
    expect(args.verifyDevCredentials).not.toHaveBeenCalled();
    expect(saveArticlesMutateAsyncMock).not.toHaveBeenCalled();
  });

  it("steps Convex notices from pending to success and marks changes saved", async () => {
    saveToConvexMutateAsyncMock.mockResolvedValue({
      success: true,
      savedItems: ["articles"],
      submittedBy: "JOSIE",
      warnings: [],
    });

    const args = createArgs();

    const { result } = renderHook(() => useDevModeSaveOperations(args));

    await act(async () => {
      await result.current.handleSaveToConvex();
    });

    expect(args.verifyDevCredentials).toHaveBeenCalledTimes(1);
    expect(saveToConvexMutateAsyncMock).toHaveBeenCalledTimes(1);
    expect(args.setConvexNotice).toHaveBeenNthCalledWith(1, {
      type: "pending",
      message: "Verifying credentials…",
    });
    expect(args.setConvexNotice).toHaveBeenNthCalledWith(2, {
      type: "pending",
      message: "Credentials verified for JOSIE. Saving to Convex…",
    });
    expect(args.setConvexNotice).toHaveBeenNthCalledWith(
      3,
      {
        type: "success",
        message: "Saved articles to Convex as JOSIE.",
      },
      { clearAfterMs: 5000 },
    );
    expect(args.setPasswordKey).toHaveBeenCalledWith("JOSIE");
    expect(args.markChangesSaved).toHaveBeenCalledTimes(1);
  });
});
