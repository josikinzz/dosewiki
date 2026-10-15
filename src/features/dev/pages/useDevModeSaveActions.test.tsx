import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SubstanceArticle } from "@/schema";
import { useDevModeSaveActions } from "./useDevModeSaveActions";

const { refreshDataServerHealthMock, saveArticleMutateAsyncMock, submitProposalMutateAsyncMock } =
  vi.hoisted(() => ({
    refreshDataServerHealthMock: vi.fn(),
    saveArticleMutateAsyncMock: vi.fn(),
    submitProposalMutateAsyncMock: vi.fn(),
  }));

vi.mock("@/hooks/useApiMutations", () => ({
  useSaveArticleMutation: () => ({
    mutateAsync: saveArticleMutateAsyncMock,
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
      canSaveToPostgres: true,
      issues: [],
      summary: "Server ready",
      checkedAt: null,
      isRefreshing: false,
    },
    refresh: refreshDataServerHealthMock,
  }),
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
    getArticleBaseHashes: () => ({ lsd: "stored-base-hash" }),
    getOriginalPsychoactiveIndexManual: () => null,
    getOriginalChemicalIndexManual: () => null,
    getOriginalMechanismIndexManual: () => null,
    markChangesSaved: vi.fn(),
    isSignedIn: true,
    canDraft: true,
    canApprove: true,
    sessionProfileKey: "JOSIE",
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
    activeProposal: null,
    onClearActiveProposal: vi.fn(),
    onDiscardActiveProposal: vi.fn(),
  };
}

function TestHarness({ args }: { args: Parameters<typeof useDevModeSaveActions>[0] }) {
  const actions = useDevModeSaveActions(args);
  return <>{actions.commitPanel}</>;
}

describe("useDevModeSaveActions", () => {
  beforeEach(() => {
    refreshDataServerHealthMock.mockReset();
    saveArticleMutateAsyncMock.mockReset();
    submitProposalMutateAsyncMock.mockReset();
    saveArticleMutateAsyncMock.mockResolvedValue({
      success: true,
      requestId: "save-test",
      savedItems: ["1 article(s)"],
      submittedBy: "JOSIE",
      warnings: [],
      revalidatedPaths: ["/lsd", "/substances"],
    });
    submitProposalMutateAsyncMock.mockResolvedValue({ proposalId: "k57abc123" });
  });

  it("submits an editor's draft as a proposal and never calls the save route", async () => {
    const args = { ...createArgs(), canApprove: false };
    render(<TestHarness args={args} />);

    expect(screen.queryByRole("button", { name: /commit to production/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /submit for review/i }));

    await waitFor(() => {
      expect(submitProposalMutateAsyncMock).toHaveBeenCalledTimes(1);
    });
    expect(saveArticleMutateAsyncMock).not.toHaveBeenCalled();
  });

  it("opens a scope sheet on Commit and writes nothing until the editor confirms", async () => {
    render(<TestHarness args={createArgs()} />);

    await userEvent.click(screen.getByRole("button", { name: /commit to production/i }));

    const sheet = await screen.findByRole("dialog");
    expect(saveArticleMutateAsyncMock).not.toHaveBeenCalled();
    await userEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(saveArticleMutateAsyncMock).not.toHaveBeenCalled();
  });

  it("keeps edits made while a confirmed batch is in flight", async () => {
    let confirm!: (value: unknown) => void;
    saveArticleMutateAsyncMock.mockImplementation(() => new Promise(resolve => { confirm = resolve; }));
    const args = createArgs();
    const view = render(<TestHarness args={args} />);
    await userEvent.click(screen.getByRole("button", { name: /commit to production/i }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /^commit/i }));
    await waitFor(() => expect(saveArticleMutateAsyncMock).toHaveBeenCalledTimes(1));
    view.rerender(<TestHarness args={{ ...args, articles: [{ ...args.articles[0], title: "Newer unsaved title" }] }} />);
    await act(async () => { confirm({ success: true, savedItems: ["1 article(s)"], warnings: [], articleReceipts: [{ slug: "lsd", baseHash: "saved-base-hash" }] }); });
    expect(args.markChangesSaved).not.toHaveBeenCalled();
  });

  it("refuses to save without a session and never calls the route", async () => {
    render(<TestHarness args={{ ...createArgs(), isSignedIn: false }} />);

    await userEvent.click(screen.getByRole("button", { name: /commit to production/i }));
    const sheet = await screen.findByRole("dialog");
    await userEvent.click(within(sheet).getByRole("button", { name: /^commit/i }));

    await waitFor(() => {
      expect(screen.getByText("Sign in before continuing.")).toBeInTheDocument();
    });
    expect(saveArticleMutateAsyncMock).not.toHaveBeenCalled();
  });
});
