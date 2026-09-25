import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const originalLayout = {
  version: 1,
  categories: [
    { key: "stimulants", label: "Stimulants", sections: [] },
    { key: "depressants", label: "Depressants", sections: [] },
  ],
};
const changedLayout = {
  version: 1,
  categories: [
    { key: "stimulants", label: "Stimulants and entactogens", sections: [] },
    { key: "depressants", label: "Sedatives", sections: [] },
  ],
};

/** A working set with Tags edits and one changed index layout. */
function createArgsWithLayout(): Parameters<typeof useDevModeSaveActions>[0] {
  return {
    ...createArgs(),
    psychoactiveIndexManual: changedLayout,
    getOriginalPsychoactiveIndexManual: () => originalLayout,
    psychoactiveManualChangelog: {
      markdown: "# Psychoactive Index Layout\n\n- \"label\": \"Stimulants\"\n+ \"label\": \"Stimulants and entactogens\"",
      hasChanges: true,
    },
  };
}

async function commitAndConfirm(user: Pick<ReturnType<typeof userEvent.setup>, "click"> = userEvent.setup()) {
  await user.click(screen.getByRole("button", { name: /commit to production/i }));
  const sheet = await screen.findByRole("dialog");
  await user.click(within(sheet).getByRole("button", { name: /^commit/i }));
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

  it("labels the admin action Commit to production, never offers Submit for review, and keeps a healthy server silent", () => {
    render(<TestHarness args={createArgs()} />);

    expect(screen.getByRole("button", { name: /commit to production/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /submit for review/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/server ready/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/server/i)).not.toBeInTheDocument();
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
    expect(screen.getByText("Submitted Proposal #abc123 for review as JOSIE.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View in queue" })).toHaveAttribute("href", "/dev/queue");
    expect(args.markChangesSaved).toHaveBeenCalledTimes(1);
    expect(args.onAppendChangeLogEntry).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("opens a scope sheet on Commit and writes nothing until the editor confirms", async () => {
    render(<TestHarness args={createArgsWithLayout()} />);

    await userEvent.click(screen.getByRole("button", { name: /commit to production/i }));

    const sheet = await screen.findByRole("dialog");
    expect(saveArticleMutateAsyncMock).not.toHaveBeenCalled();
    await userEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(saveArticleMutateAsyncMock).not.toHaveBeenCalled();
  });

  it("names every dataset the commit changes with its change count", async () => {
    render(<TestHarness args={createArgsWithLayout()} />);

    await userEvent.click(screen.getByRole("button", { name: /commit to production/i }));

    const sheet = await screen.findByRole("dialog");
    const tags = within(sheet).getByRole("listitem", { name: "Tags" });
    expect(tags).toHaveTextContent("1 article");
    const layout = within(sheet).getByRole("listitem", { name: "Index layout: Psychoactive class" });
    expect(layout).toHaveTextContent("2 categories");
    expect(within(sheet).queryByRole("listitem", { name: /chemical class/i })).toBeNull();
    expect(within(sheet).queryByRole("listitem", { name: /mechanism of action/i })).toBeNull();
  });

  it("sends the change note with the commit once confirmed", async () => {
    render(<TestHarness args={createArgs()} />);

    await userEvent.click(screen.getByRole("button", { name: /commit to production/i }));
    const sheet = await screen.findByRole("dialog");
    await userEvent.type(within(sheet).getByLabelText(/change note/i), "Fix LSD summary");
    await userEvent.click(within(sheet).getByRole("button", { name: /^commit/i }));

    await waitFor(() => expect(saveArticleMutateAsyncMock).toHaveBeenCalledTimes(1));
    expect(saveArticleMutateAsyncMock.mock.calls[0][0].changelog.markdown).toBe(
      "Note: Fix LSD summary\n\n# LSD\n\n+ Changed summary",
    );
  });

  it("keeps a save error on screen after 15 seconds until the editor dismisses it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    saveArticleMutateAsyncMock.mockRejectedValue(new Error("The layout changed on the server."));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TestHarness args={createArgs()} />);

    await commitAndConfirm(user);
    await screen.findByText("The layout changed on the server.");

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByText("The layout changed on the server.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText("The layout changed on the server.")).toBeNull();
  });

  it("clears a success notice on its own", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TestHarness args={createArgs()} />);

    await commitAndConfirm(user);
    await screen.findByText("Committed 1 article(s) to production as JOSIE.");

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.queryByText("Committed 1 article(s) to production as JOSIE.")).toBeNull();
  });

  it("logs nothing to console.info while it saves", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    render(<TestHarness args={createArgs()} />);

    await commitAndConfirm();

    await screen.findByText("Committed 1 article(s) to production as JOSIE.");
    expect(info).not.toHaveBeenCalled();
  });

  it("executes the production commit once the session is verified", async () => {
    render(<TestHarness args={createArgs()} />);

    await commitAndConfirm();

    await waitFor(() => {
      expect(saveArticleMutateAsyncMock).toHaveBeenCalledTimes(1);
    });
    expect(saveArticleMutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        articles: [changedArticles[0]],
        changelog: {
          markdown: "# LSD\n\n+ Changed summary",
          articles: [{ id: 1, title: "LSD", slug: "lsd" }],
        },
      }),
    );
    expect(screen.getByText("Committed 1 article(s) to production as JOSIE.")).toBeInTheDocument();
  });

  it("attributes the save to the session profile key and reports it", async () => {
    saveArticleMutateAsyncMock.mockResolvedValue({
      success: true,
      requestId: "save-test",
      savedItems: ["1 article(s)"],
      warnings: [],
      revalidatedPaths: [],
    });
    render(<TestHarness args={createArgs()} />);

    await commitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText("Committed 1 article(s) to production as JOSIE.")).toBeInTheDocument();
    });
  });

  it("refuses to save without a session and never calls the route", async () => {
    render(<TestHarness args={{ ...createArgs(), isSignedIn: false }} />);

    await commitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText("Sign in before continuing.")).toBeInTheDocument();
    });
    expect(saveArticleMutateAsyncMock).not.toHaveBeenCalled();
  });

  it("names the returned proposal being revised with its reason, and Discard hands back to the context", async () => {
    const args = {
      ...createArgs(),
      canApprove: false,
      activeProposal: { proposalId: "k57zyx987654", reason: "Article lsd changed", summary: "Update LSD" },
    };
    render(<TestHarness args={args} />);

    const banner = screen.getByTestId("commit-rebase-banner");
    expect(banner).toHaveTextContent("Revising returned proposal #987654: Article lsd changed");
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(args.onDiscardActiveProposal).toHaveBeenCalledTimes(1);
    expect(args.onClearActiveProposal).not.toHaveBeenCalled();
  });

  it("renders the banner without a reason and never renders it when nothing is being rebased", () => {
    const { unmount } = render(
      <TestHarness
        args={{ ...createArgs(), activeProposal: { proposalId: "k57zyx987654", reason: null, summary: "Update LSD" } }}
      />,
    );
    expect(screen.getByTestId("commit-rebase-banner")).toHaveTextContent(/^Revising returned proposal #987654$/);
    unmount();

    render(<TestHarness args={createArgs()} />);
    expect(screen.queryByTestId("commit-rebase-banner")).toBeNull();
  });

  it("submits the rebase with revisionOf and clears the proposal link on success", async () => {
    const args = {
      ...createArgs(),
      canApprove: false,
      activeProposal: { proposalId: "k57zyx987654", reason: "Article lsd changed", summary: "Update LSD" },
    };
    render(<TestHarness args={args} />);

    await userEvent.click(screen.getByRole("button", { name: /submit for review/i }));

    await waitFor(() => expect(submitProposalMutateAsyncMock).toHaveBeenCalledTimes(1));
    expect(submitProposalMutateAsyncMock).toHaveBeenCalledWith(expect.objectContaining({ revisionOf: "k57zyx987654" }));
    await waitFor(() => expect(args.onClearActiveProposal).toHaveBeenCalledTimes(1));
    expect(args.onDiscardActiveProposal).not.toHaveBeenCalled();
  });

  it("submits a fresh proposal without revisionOf and leaves the clear callback alone", async () => {
    const args = { ...createArgs(), canApprove: false };
    render(<TestHarness args={args} />);

    await userEvent.click(screen.getByRole("button", { name: /submit for review/i }));

    await waitFor(() => expect(submitProposalMutateAsyncMock).toHaveBeenCalledTimes(1));
    expect(submitProposalMutateAsyncMock).toHaveBeenCalledWith(expect.not.objectContaining({ revisionOf: expect.anything() }));
    expect(args.onClearActiveProposal).not.toHaveBeenCalled();
  });
});
