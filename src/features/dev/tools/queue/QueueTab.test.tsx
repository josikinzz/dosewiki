import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QueueTab } from "./QueueTab";
import type { ProposalDetail, ProposalSummary } from "./queueModel";

/** The tab as an editor renders it: no admin buttons, load handed to the shell. */
function renderQueue(overrides: Partial<Parameters<typeof QueueTab>[0]> = {}) {
  const onLoadIntoEditor = vi.fn(async () => undefined);
  render(
    <QueueTab canApprove={false} onLoadIntoEditor={onLoadIntoEditor} {...overrides} />,
  );
  return { onLoadIntoEditor };
}

const BASE = "/api/dev/proposals";

const submitted: ProposalSummary = {
  _id: "cp_1",
  proposerName: "Ada",
  isAuthor: false,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
  status: "submitted",
  targets: [
    { kind: "article", key: "lsd", baseHash: "h-lsd" },
    { kind: "indexLayout", key: "chemical", baseHash: "h-chem" },
  ],
  summary: "Update LSD",
  commentCount: 1,
};

const applied: ProposalSummary = {
  ...submitted,
  _id: "cp_2",
  status: "applied",
  summary: "Retitle DMT",
  targets: [{ kind: "article", key: "dmt", baseHash: "h-dmt" }],
  appliedAt: "2026-09-02T10:00:00.000Z",
  commentCount: 0,
};

const requested: ProposalSummary = {
  ...submitted,
  _id: "cp_3",
  status: "changes_requested",
  summary: "Mescaline dosing",
  conflictReason: "Article lsd changed since this proposal was pinned.",
  commentCount: 0,
};

/** `cp_1` with the LSD article drifted and the chemical layout untouched. */
const submittedDetail: ProposalDetail = {
  ...submitted,
  diff: "# LSD\n\n- Stored summary\n+ Proposed summary",
  comments: [{ authorName: "Josie", at: "2026-09-01T11:00:00.000Z", text: "Checked the citations." }],
  liveHashes: [
    { kind: "article", key: "lsd", hash: "h-lsd-moved" },
    { kind: "indexLayout", key: "chemical", hash: "h-chem" },
  ],
  payload: {
    articles: [{ title: "LSD", slug: "lsd", summary: "Proposed summary" }],
    indexLayouts: [{ type: "chemical", version: 2, categories: [] }],
  },
};

const requestedDetail: ProposalDetail = {
  ...requested,
  diff: "",
  comments: [],
  liveHashes: [],
  payload: { articles: [{ title: "Mescaline", slug: "mescaline", summary: "New dosing" }] },
};

type Call = { url: string; method: string; body: Record<string, unknown> | null };

function stubQueueApi(
  rows: ProposalSummary[],
  details: Record<string, ProposalDetail>,
  approveAnswer: Record<string, unknown> = { ok: true, status: "applied" },
) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
    if (url === BASE) {
      return Response.json({ ok: true, proposals: rows });
    }
    if (method === "POST" && url.endsWith("/approve")) {
      return Response.json(approveAnswer);
    }
    if (method === "POST" && url.endsWith("/comment")) {
      return Response.json({ ok: true, comment: { authorName: "Contributor", at: "now", text: "x" } });
    }
    if (method === "POST") {
      return Response.json({ ok: true });
    }
    const id = url.slice(BASE.length + 1).split("?")[0];
    const detail = details[id];
    return detail
      ? Response.json({ ok: true, proposal: detail })
      : Response.json({ error: "No proposal with that id." }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

const group = (id: string) => within(screen.getByTestId(`queue-group-${id}`));

describe("QueueTab", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("separates pending submissions from history, omits empty groups, and shows the selected change and discussion", async () => {
    stubQueueApi([submitted, applied, requested], { cp_1: submittedDetail });
    renderQueue();

    await waitFor(() => expect(screen.getByTestId("queue-group-submitted-count")).toHaveTextContent("1"));
    expect(screen.getByTestId("queue-group-changes_requested-count")).toHaveTextContent("1");
    expect(screen.getByTestId("queue-group-applied-count")).toHaveTextContent("1");
    expect(screen.queryByTestId("queue-group-closed")).not.toBeInTheDocument();
    expect(group("submitted").getByText("Update LSD")).toBeInTheDocument();
    expect(group("applied").getByText("Retitle DMT")).toBeInTheDocument();
    expect(group("changes_requested").getByText("Mescaline dosing")).toBeInTheDocument();

    await userEvent.click(group("submitted").getByRole("button", { name: /Update LSD/ }));

    await waitFor(() => expect(screen.getAllByTestId("proposal-target")).toHaveLength(2));
    const [lsd, chemical] = screen.getAllByTestId("proposal-target");
    expect(lsd).toHaveTextContent("lsd");
    expect(chemical).toHaveTextContent("chemical");

    expect(screen.getByText(submitted.proposerName)).toBeInTheDocument();
    expect(screen.getByText("Before")).toBeInTheDocument();
    expect(screen.getByText("After")).toBeInTheDocument();
    expect(screen.getByRole("deletion")).toHaveTextContent("Stored");
    expect(screen.getByRole("insertion")).toHaveTextContent("Proposed");
    expect(screen.getByText("Checked the citations.")).toBeInTheDocument();

    // An editor reads and comments; the admin decisions never render.
    expect(screen.getByRole("button", { name: "Post comment" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Revert" })).toBeNull();
  });

  it("keeps unrelated JSON fields as separate removals and additions, not a prose replacement", async () => {
    stubQueueApi([submitted], {
      cp_1: { ...submittedDetail, diff: '# LSD\n- "_id": "old",\n+ "summary": "New summary",' },
    });
    renderQueue();
    await userEvent.click(await screen.findByRole("button", { name: /Update LSD/ }));

    const diff = await screen.findByLabelText("Diff of changed lines");
    expect(diff).toHaveTextContent('- "_id": "old",');
    expect(diff).toHaveTextContent('+ "summary": "New summary",');
    expect(screen.queryByText("Before")).not.toBeInTheDocument();
    expect(screen.queryByText("After")).not.toBeInTheDocument();
  });


  it("renders approve and reject for an admin on a submitted proposal, and posts them to the review routes once confirmed", async () => {
    const { calls } = stubQueueApi([submitted], { cp_1: submittedDetail });
    renderQueue({ canApprove: true });

    await userEvent.click(await screen.findByRole("button", { name: /Update LSD/ }));

    await screen.findByRole("button", { name: "Approve and apply" });
    const reject = screen.getByRole("button", { name: "Reject" });
    expect(screen.queryByRole("button", { name: "Revert" })).toBeNull();
    expect(reject).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Rejection note"), "Needs a citation.");
    expect(reject).toBeEnabled();
    await userEvent.click(reject);
    const rejectDialog = await screen.findByRole("dialog", { name: "Reject this proposal?" });
    expect(rejectDialog).toHaveTextContent("Needs a citation.");
    await userEvent.click(within(rejectDialog).getByRole("button", { name: "Reject proposal" }));
    await waitFor(() =>
      expect(calls).toContainEqual({ url: `${BASE}/cp_1/reject`, method: "POST", body: { note: "Needs a citation." } }),
    );
    expect(await screen.findByText("Proposal rejected.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "Approve and apply" }));
    const approveDialog = await screen.findByRole("dialog", { name: "Apply to production?" });
    expect(calls.some((call) => call.url.endsWith("/approve"))).toBe(false);
    await userEvent.click(within(approveDialog).getByRole("button", { name: "Apply to production" }));
    await waitFor(() => expect(calls).toContainEqual({ url: `${BASE}/cp_1/approve`, method: "POST", body: {} }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve and apply" })).toBeEnabled());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("cancelling the confirm writes nothing and keeps the rejection note", async () => {
    const { calls } = stubQueueApi([submitted], { cp_1: submittedDetail });
    renderQueue({ canApprove: true });

    await userEvent.click(await screen.findByRole("button", { name: /Update LSD/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Approve and apply" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await userEvent.type(screen.getByLabelText("Rejection note"), "Hold on.");
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);
    expect(screen.getByLabelText("Rejection note")).toHaveValue("Hold on.");
  });

  it("surfaces an approve that came back as changes requested with the conflict reason", async () => {
    stubQueueApi([submitted], { cp_1: submittedDetail }, {
      ok: true,
      status: "changes_requested",
      conflictReason: "Article lsd moved.",
    });
    renderQueue({ canApprove: true });

    await userEvent.click(await screen.findByRole("button", { name: /Update LSD/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Approve and apply" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Apply to production" }));

    expect(await screen.findByText("Article lsd moved.")).toBeInTheDocument();
  });

  it("offers revert only on an applied proposal and posts a comment with the typed text", async () => {
    const { calls } = stubQueueApi([applied], {
      cp_2: { ...applied, diff: "", comments: [], liveHashes: [{ kind: "article", key: "dmt", hash: "h-dmt" }], payload: {} },
    });
    renderQueue({ canApprove: true });

    await userEvent.click(await screen.findByRole("button", { name: /Retitle DMT/ }));

    const revert = await screen.findByRole("button", { name: "Revert" });
    expect(screen.queryByRole("button", { name: "Approve and apply" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    await userEvent.click(revert);
    const revertDialog = await screen.findByRole("dialog", { name: "Revert production?" });
    expect(revertDialog).toHaveTextContent("Article dmt");
    await userEvent.click(within(revertDialog).getByRole("button", { name: "Revert production" }));
    await waitFor(() => expect(calls).toContainEqual({ url: `${BASE}/cp_2/revert`, method: "POST", body: {} }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const post = screen.getByRole("button", { name: "Post comment" });
    expect(post).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Add a comment"), "Reverted after the report.");
    await userEvent.click(post);
    await waitFor(() =>
      expect(calls).toContainEqual({
        url: `${BASE}/cp_2/comment`,
        method: "POST",
        body: { text: "Reverted after the report." },
      }),
    );
    expect(await screen.findByText("Comment posted.")).toBeInTheDocument();
  });

  it("points an empty queue at the Substances editor", async () => {
    stubQueueApi([], {});
    renderQueue();

    expect(await screen.findByRole("link", { name: "Open the Substances editor" })).toHaveAttribute("href", "/dev/articles");
  });

  describe("Load into editor", () => {
    it("shows it to the proposer on a returned proposal and hands the shell the seed from a fresh read", async () => {
      const { calls } = stubQueueApi([requested], { cp_3: { ...requestedDetail, isAuthor: true } });
      const { onLoadIntoEditor } = renderQueue();

      await userEvent.click(await screen.findByRole("button", { name: /Mescaline dosing/ }));
      const load = await screen.findByRole("button", { name: "Load into editor" });
      expect(load).toBeEnabled();
      const readsBefore = calls.filter((call) => call.url.startsWith(`${BASE}/cp_3`)).length;

      await userEvent.click(load);

      await waitFor(() => expect(onLoadIntoEditor).toHaveBeenCalledTimes(1));
      expect(calls.filter((call) => call.url === `${BASE}/cp_3?seed=1`).length).toBe(1);
      expect(onLoadIntoEditor).toHaveBeenCalledWith({
        proposalId: "cp_3",
        summary: "Mescaline dosing",
        reason: "Article lsd changed since this proposal was pinned.",
        payload: requestedDetail.payload,
      });
    });

    it("shows it to an admin, and to the proposer of a waiting proposal, but not to another editor", async () => {
      stubQueueApi([submitted, requested], { cp_1: submittedDetail, cp_3: requestedDetail });

      renderQueue({ canApprove: true });
      await userEvent.click(await screen.findByRole("button", { name: /Mescaline dosing/ }));
      expect(await screen.findByRole("button", { name: "Load into editor" })).toBeInTheDocument();
      cleanup();

      stubQueueApi([submitted], { cp_1: { ...submittedDetail, isAuthor: true } });
      renderQueue();
      await userEvent.click(await screen.findByRole("button", { name: /Update LSD/ }));
      expect(await screen.findByRole("button", { name: "Load into editor" })).toBeInTheDocument();
      cleanup();

      stubQueueApi([requested], { cp_3: requestedDetail });
      renderQueue();
      await userEvent.click(await screen.findByRole("button", { name: /Mescaline dosing/ }));
      await screen.findByRole("button", { name: "Post comment" });
      expect(screen.queryByRole("button", { name: "Load into editor" })).toBeNull();
      cleanup();

      // A copy-block proposal belongs to Copy Studio, not the substances editor.
      const copyRow: ProposalSummary = {
        ...requested,
        _id: "cp_4",
        summary: "Footer copy",
        targets: [{ kind: "copyBlock", key: "footer", baseHash: "h-footer" }],
      };
      stubQueueApi([copyRow], { cp_4: { ...copyRow, diff: "", comments: [], liveHashes: [], payload: {} } });
      renderQueue({ canApprove: true });
      await userEvent.click(await screen.findByRole("button", { name: /Footer copy/ }));
      await screen.findByRole("button", { name: "Post comment" });
      expect(screen.queryByRole("button", { name: "Load into editor" })).toBeNull();
      expect(screen.getByRole("link", { name: "Open Copy editor: footer" })).toHaveAttribute("href", "/dev/copy-studio/footer");
    });


    it("reports a seed that failed instead of leaving the tab", async () => {
      stubQueueApi([requested], { cp_3: { ...requestedDetail, isAuthor: true } });
      const onLoadIntoEditor = vi.fn(async () => {
        throw new Error("Could not load mescaline from the library; try again.");
      });
      renderQueue({ onLoadIntoEditor });

      await userEvent.click(await screen.findByRole("button", { name: /Mescaline dosing/ }));
      await userEvent.click(await screen.findByRole("button", { name: "Load into editor" }));

      expect(await screen.findByText("Could not load mescaline from the library; try again.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Load into editor" })).toBeEnabled();
    });

    it("routes About revisions to Writing instead of loading a substances seed", async () => {
      const aboutRow: ProposalSummary = {
        ...requested,
        targets: [{ kind: "about", key: "about", baseHash: "h-about" }],
      };
      stubQueueApi([aboutRow], { cp_3: { ...requestedDetail, ...aboutRow, isAuthor: true } });
      renderQueue();
      await userEvent.click(await screen.findByRole("button", { name: /Mescaline dosing/ }));
      expect(await screen.findByRole("link", { name: "Open About editor" })).toHaveAttribute("href", "/dev/writing/about");
      expect(screen.queryByRole("button", { name: "Load into editor" })).not.toBeInTheDocument();
    });
  });

  it("prevents an admin approving their own submission", async () => {
    const { calls } = stubQueueApi([submitted], { cp_1: { ...submittedDetail, isAuthor: true } });
    renderQueue({ canApprove: true });
    await userEvent.click(await screen.findByRole("button", { name: /Update LSD/ }));
    const approve = await screen.findByRole("button", { name: "Approve and apply" });
    expect(approve).toBeDisabled();
    await userEvent.click(approve);
    expect(calls.filter((call) => call.method === "POST")).toEqual([]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("retains separate comment and rejection drafts when switching submissions", async () => {
    stubQueueApi([submitted, requested], { cp_1: submittedDetail, cp_3: requestedDetail });
    renderQueue({ canApprove: true });
    await userEvent.click(await screen.findByRole("button", { name: /Update LSD/ }));
    await userEvent.type(await screen.findByLabelText("Add a comment"), "Question about LSD");
    await userEvent.type(screen.getByLabelText("Rejection note"), "Missing evidence");
    await userEvent.click(screen.getByRole("button", { name: /Mescaline dosing/ }));
    expect(await screen.findByLabelText("Add a comment")).toHaveValue("");
    expect(screen.getByLabelText("Rejection note")).toHaveValue("");
    await userEvent.type(screen.getByLabelText("Add a comment"), "Question about mescaline");
    await userEvent.click(screen.getByRole("button", { name: /Update LSD/ }));
    expect(await screen.findByLabelText("Add a comment")).toHaveValue("Question about LSD");
    expect(screen.getByLabelText("Rejection note")).toHaveValue("Missing evidence");
    await userEvent.click(screen.getByRole("button", { name: /Mescaline dosing/ }));
    expect(await screen.findByLabelText("Add a comment")).toHaveValue("Question about mescaline");
  });

  it("keeps an in-flight action on its submission and never transfers its feedback to the next selection", async () => {
    const { fetchMock } = stubQueueApi([submitted, requested], { cp_1: submittedDetail, cp_3: requestedDetail });
    renderQueue();
    await userEvent.click(await screen.findByRole("button", { name: /Update LSD/ }));
    await userEvent.type(await screen.findByLabelText("Add a comment"), "Please check");
    let resolvePost!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolvePost = resolve; }));
    await userEvent.click(screen.getByRole("button", { name: "Post comment" }));
    const other = screen.getByRole("button", { name: /Mescaline dosing/ });
    expect(other).toBeDisabled();
    await userEvent.click(other);
    expect(screen.getByRole("button", { name: /Update LSD/ })).toHaveAttribute("aria-pressed", "true");
    await act(async () => { resolvePost(Response.json({ ok: true, comment: { authorName: "Contributor", at: "now", text: "Please check" } })); });
    expect(await screen.findByText("Comment posted.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Mescaline dosing/ }));
    expect(await screen.findByLabelText("Add a comment")).toHaveValue("");
    expect(screen.queryByText("Comment posted.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mescaline dosing/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("preserves a failed comment for retry and unlocks navigation", async () => {
    const { fetchMock, calls } = stubQueueApi([submitted, requested], { cp_1: submittedDetail, cp_3: requestedDetail });
    renderQueue();
    await userEvent.click(await screen.findByRole("button", { name: /Update LSD/ }));
    await userEvent.type(await screen.findByLabelText("Add a comment"), "Keep this draft");
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Unable to save comment" }, { status: 503 }));
    await userEvent.click(screen.getByRole("button", { name: "Post comment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save comment");
    expect(screen.getByLabelText("Add a comment")).toHaveValue("Keep this draft");
    expect(screen.getByRole("button", { name: /Mescaline dosing/ })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Post comment" }));
    expect(await screen.findByText("Comment posted.")).toBeInTheDocument();
    expect(screen.getByLabelText("Add a comment")).toHaveValue("");
    expect(calls).toContainEqual({ url: `${BASE}/cp_1/comment`, method: "POST", body: { text: "Keep this draft" } });
  });

  it("ignores a late detail response after another submission has been selected", async () => {
    const { fetchMock } = stubQueueApi([submitted, requested], { cp_1: submittedDetail, cp_3: requestedDetail });
    renderQueue();
    await screen.findByRole("button", { name: /Update LSD/ });
    let resolveFirst!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirst = resolve; }));
    await userEvent.click(screen.getByRole("button", { name: /Update LSD/ }));
    await userEvent.click(screen.getByRole("button", { name: /Mescaline dosing/ }));
    await screen.findByLabelText("Add a comment");
    await act(async () => { resolveFirst(Response.json({ ok: true, proposal: submittedDetail })); });
    expect(screen.getByRole("button", { name: /Mescaline dosing/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Checked the citations.")).not.toBeInTheDocument();
  });

  it("retries a failed detail request without requiring another selection", async () => {
    const { fetchMock } = stubQueueApi([submitted], { cp_1: submittedDetail });
    renderQueue();
    await screen.findByRole("button", { name: /Update LSD/ });
    fetchMock.mockRejectedValueOnce(new Error("Offline"));
    await userEvent.click(screen.getByRole("button", { name: /Update LSD/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Checked the citations.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Update LSD/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("recovers from a failed list request", async () => {
    const { fetchMock } = stubQueueApi([submitted], { cp_1: submittedDetail });
    fetchMock.mockRejectedValueOnce(new Error("Offline"));
    renderQueue();
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await userEvent.click(await screen.findByRole("button", { name: /Update LSD/ }));
    expect(await screen.findByLabelText("Add a comment")).toBeEnabled();
  });

  it("refreshes the selected status and actions without discarding its comment draft", async () => {
    const details = { cp_1: submittedDetail };
    stubQueueApi([submitted], details);
    renderQueue({ canApprove: true });
    await userEvent.click(await screen.findByRole("button", { name: /Update LSD/ }));
    await userEvent.type(await screen.findByLabelText("Add a comment"), "Still drafting");
    expect(screen.getByRole("button", { name: "Approve and apply" })).toBeEnabled();
    details.cp_1 = { ...submittedDetail, status: "applied", appliedAt: "2026-09-04T10:00:00.000Z" };
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("button", { name: "Revert" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Approve and apply" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Add a comment")).toHaveValue("Still drafting");
  });
});
