import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SubstanceArticle } from "@/schema";
import { useDevModeSaveActions } from "./useDevModeSaveActions";

const { refreshConvexServerHealthMock, saveToConvexMutateAsyncMock, submitProposalMutateAsyncMock } =
  vi.hoisted(() => ({
    refreshConvexServerHealthMock: vi.fn(),
    saveToConvexMutateAsyncMock: vi.fn(),
    submitProposalMutateAsyncMock: vi.fn(),
  }));

vi.mock("@/hooks/useApiMutations", () => ({
  useSaveToConvexMutation: () => ({
    mutateAsync: saveToConvexMutateAsyncMock,
    isPending: false,
  }),
  useSubmitProposalMutation: () => ({
    mutateAsync: submitProposalMutateAsyncMock,
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
    canDraft: true,
    canApprove: true,
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
  };
}

function TestHarness({ args }: { args: Parameters<typeof useDevModeSaveActions>[0] }) {
  const actions = useDevModeSaveActions(args);
  return <>{actions.commitPanel}</>;
}

describe("useDevModeSaveActions", () => {
  beforeEach(() => {
    refreshConvexServerHealthMock.mockReset();
    saveToConvexMutateAsyncMock.mockReset();
    submitProposalMutateAsyncMock.mockReset();
    saveToConvexMutateAsyncMock.mockResolvedValue({
      success: true,
      requestId: "save-test",
      savedItems: ["1 article(s)"],
      submittedBy: "JOSIE",
      warnings: [],
      revalidatedPaths: ["/lsd", "/substances"],
    });
    submitProposalMutateAsyncMock.mockResolvedValue({ proposalId: "k57abc123" });
  });

  it("labels the admin action Save to Convex and never offers Submit for review", () => {
    render(<TestHarness args={createArgs()} />);

    expect(screen.getByRole("button", { name: /save to convex/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /submit for review/i })).not.toBeInTheDocument();
  });

  it("submits an editor's draft as a proposal and never calls the save route", async () => {
    const args = { ...createArgs(), canApprove: false };
    render(<TestHarness args={args} />);

    expect(screen.queryByRole("button", { name: /save to convex/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /submit for review/i }));

    await waitFor(() => {
      expect(submitProposalMutateAsyncMock).toHaveBeenCalledTimes(1);
    });
    expect(submitProposalMutateAsyncMock).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        articles: [changedArticles[0]],
        changelog: {
          markdown: "# LSD\n\n+ Changed summary",
          articles: [{ id: 1, title: "LSD", slug: "lsd" }],
        },
      }),
      summary: "Update LSD",
      diff: "# LSD\n\n+ Changed summary",
    });
    expect(saveToConvexMutateAsyncMock).not.toHaveBeenCalled();
    expect(screen.getByText("Submitted Proposal #abc123 for review as JOSIE.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View in queue" })).toHaveAttribute("href", "/dev/queue");
    expect(args.markChangesSaved).toHaveBeenCalledTimes(1);
    expect(args.onAppendChangeLogEntry).not.toHaveBeenCalled();
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
    expect(screen.getByText("Saved 1 article(s) to Convex as JOSIE.")).toBeInTheDocument();
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
      expect(screen.getByText("Saved 1 article(s) to Convex as JOSIE.")).toBeInTheDocument();
    });
  });

  it("refuses to save without a session and never calls the route", async () => {
    render(<TestHarness args={{ ...createArgs(), isSignedIn: false }} />);

    await userEvent.click(screen.getByRole("button", { name: /save to convex/i }));

    await waitFor(() => {
      expect(screen.getByText("Sign in before continuing.")).toBeInTheDocument();
    });
    expect(saveToConvexMutateAsyncMock).not.toHaveBeenCalled();
  });
});
