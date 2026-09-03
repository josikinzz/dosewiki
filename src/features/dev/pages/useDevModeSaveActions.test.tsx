import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SubstanceArticle } from "@/schema";
import { useDevModeSaveActions } from "./useDevModeSaveActions";

const {
  refreshConvexServerHealthMock,
  saveArticlesMutateAsyncMock,
  saveToConvexMutateAsyncMock,
} = vi.hoisted(() => ({
  refreshConvexServerHealthMock: vi.fn(),
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
    isPending: false,
  }),
}));

vi.mock("@/hooks/useEditorServerConfigHealth", () => ({
  useEditorServerConfigHealth: () => ({
    health: {
      status: "healthy",
      canSaveToConvex: true,
      issues: [],
      summary: "Server ready",
      checkedAt: null,
      isRefreshing: false,
    },
    refresh: refreshConvexServerHealthMock,
  }),
}));

vi.mock("@/lib/convex", () => ({
  isConvexEnabled: () => true,
}));

const originalArticles = [
  {
    id: 1,
    title: "LSD",
    slug: "lsd",
    summary: { content: "Original" },
  },
] as unknown as SubstanceArticle[];

const changedArticles = [
  {
    id: 1,
    title: "LSD",
    slug: "lsd",
    summary: { content: "Changed" },
  },
] as unknown as SubstanceArticle[];

function createArgs(): Parameters<typeof useDevModeSaveActions>[0] {
  return {
    articles: changedArticles,
    psychoactiveIndexManual: null,
    chemicalIndexManual: null,
    mechanismIndexManual: null,
    getOriginalArticles: () => originalArticles,
    markChangesSaved: vi.fn(),
    isSignedIn: true,
    canEdit: true,
    sessionProfileKey: "JOSIE",
    convexEnabled: true,
    datasetChangelog: {
      markdown: "# LSD\n\n+ Changed summary",
      articles: [{ id: 1, title: "LSD", slug: "lsd" }],
      sections: [{ index: 0, heading: "LSD", markdown: "# LSD\n\n+ Changed summary" }],
    },
    psychoactiveManualChangelog: { markdown: "", hasChanges: false },
    chemicalManualChangelog: { markdown: "", hasChanges: false },
    mechanismManualChangelog: { markdown: "", hasChanges: false },
    hasPendingChanges: true,
    onAppendChangeLogEntry: vi.fn(),
    onTabChange: vi.fn(),
    pushChangeLogNotice: vi.fn(),
  };
}

function TestHarness({ args }: { args: Parameters<typeof useDevModeSaveActions>[0] }) {
  const actions = useDevModeSaveActions(args);
  return <>{actions.commitPanel}</>;
}

describe("useDevModeSaveActions", () => {
  beforeEach(() => {
    refreshConvexServerHealthMock.mockReset();
    saveArticlesMutateAsyncMock.mockReset();
    saveToConvexMutateAsyncMock.mockReset();
    saveToConvexMutateAsyncMock.mockResolvedValue({
      success: true,
      requestId: "save-test",
      savedItems: ["1 article(s)"],
      submittedBy: "JOSIE",
      warnings: [],
      revalidatedPaths: ["/lsd", "/substances"],
    });
  });

  it("executes the Convex save once the session is verified", async () => {
    render(<TestHarness args={createArgs()} />);

    await userEvent.click(screen.getByRole("button", { name: /save to convex/i }));

    await waitFor(() => {
      expect(saveToConvexMutateAsyncMock).toHaveBeenCalledTimes(1);
    });
    expect(saveToConvexMutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        articles: [changedArticles[0]],
        changelog: {
          markdown: "# LSD\n\n+ Changed summary",
          articles: [{ id: 1, title: "LSD", slug: "lsd" }],
        },
      }),
    );
    expect(screen.getAllByText("Saved 1 article(s) to Convex as JOSIE.").length).toBeGreaterThan(0);
  });

  it("attributes the save to the session profile key and reports it", async () => {
    saveToConvexMutateAsyncMock.mockResolvedValue({
      success: true,
      requestId: "save-test",
      savedItems: ["1 article(s)"],
      warnings: [],
      revalidatedPaths: [],
    });
    render(<TestHarness args={createArgs()} />);

    await userEvent.click(screen.getByRole("button", { name: /save to convex/i }));

    await waitFor(() => {
      expect(screen.getAllByText("Saved 1 article(s) to Convex as JOSIE.").length).toBeGreaterThan(0);
    });
  });

  it("refuses to save without a session and never calls the route", async () => {
    render(<TestHarness args={{ ...createArgs(), isSignedIn: false }} />);

    await userEvent.click(screen.getByRole("button", { name: /save to convex/i }));

    await waitFor(() => {
      expect(screen.getAllByText("Sign in before continuing.").length).toBeGreaterThan(0);
    });
    expect(saveToConvexMutateAsyncMock).not.toHaveBeenCalled();
  });
});
