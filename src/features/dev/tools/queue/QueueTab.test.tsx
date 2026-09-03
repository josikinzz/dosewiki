import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QueueTab } from "./QueueTab";
import type { ProposalDetail, ProposalSummary } from "./queueModel";

const BASE = "/api/dev/proposals";

const submitted: ProposalSummary = {
  _id: "cp_1",
  proposedBy: "ada@example.com",
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
  comments: [{ by: "josie@example.com", at: "2026-09-01T11:00:00.000Z", text: "Checked the citations." }],
  liveHashes: [
    { kind: "article", key: "lsd", hash: "h-lsd-moved" },
    { kind: "indexLayout", key: "chemical", hash: "h-chem" },
  ],
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
      return Response.json({ ok: true, comment: { by: "me", at: "now", text: "x" } });
    }
    if (method === "POST") {
      return Response.json({ ok: true });
    }
    const id = url.slice(BASE.length + 1);
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

  it("groups proposals by status with counts and flags a drifted target on the open proposal", async () => {
    stubQueueApi([submitted, applied, requested], { cp_1: submittedDetail });
    render(<QueueTab canApprove={false} />);

    await waitFor(() => expect(screen.getByTestId("queue-group-submitted-count")).toHaveTextContent("1"));
    expect(screen.getByTestId("queue-group-changes_requested-count")).toHaveTextContent("1");
    expect(screen.getByTestId("queue-group-approved-count")).toHaveTextContent("1");
    expect(screen.getByTestId("queue-group-closed-count")).toHaveTextContent("0");
    expect(group("submitted").getByText("Update LSD")).toBeInTheDocument();
    expect(group("approved").getByText("Retitle DMT")).toBeInTheDocument();
    expect(group("changes_requested").getByText("Mescaline dosing")).toBeInTheDocument();

    await userEvent.click(group("submitted").getByRole("button", { name: /Update LSD/ }));

    await waitFor(() => expect(screen.getAllByTestId("proposal-target")).toHaveLength(2));
    const [lsd, chemical] = screen.getAllByTestId("proposal-target");
    expect(lsd).toHaveTextContent("lsd");
    expect(lsd).toHaveTextContent("Drifted");
    expect(chemical).toHaveTextContent("chemical");
    expect(chemical).toHaveTextContent("Matches production");
    expect(chemical).not.toHaveTextContent("Drifted");

    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(document.querySelector("pre")).toHaveTextContent("+ Proposed summary");
    expect(screen.getByText("Checked the citations.")).toBeInTheDocument();

    // An editor reads and comments; the admin decisions never render.
    expect(screen.getByRole("button", { name: "Post comment" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Revert" })).toBeNull();
  });

  it("shows the conflict reason as an alert on a changes-requested proposal", async () => {
    stubQueueApi([requested], {
      cp_3: { ...requested, diff: "", comments: [], liveHashes: [] },
    });
    render(<QueueTab canApprove={false} />);

    await userEvent.click(await screen.findByRole("button", { name: /Mescaline dosing/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Changes requested");
    expect(alert).toHaveTextContent("Article lsd changed since this proposal was pinned.");
  });

  it("renders approve and reject for an admin on a submitted proposal, and posts them to the review routes", async () => {
    const { calls } = stubQueueApi([submitted], { cp_1: submittedDetail });
    render(<QueueTab canApprove />);

    await userEvent.click(await screen.findByRole("button", { name: /Update LSD/ }));

    const approve = await screen.findByRole("button", { name: "Approve and apply" });
    const reject = screen.getByRole("button", { name: "Reject" });
    expect(screen.queryByRole("button", { name: "Revert" })).toBeNull();
    expect(reject).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Rejection note"), "Needs a citation.");
    expect(reject).toBeEnabled();
    await userEvent.click(reject);
    await waitFor(() =>
      expect(calls).toContainEqual({ url: `${BASE}/cp_1/reject`, method: "POST", body: { note: "Needs a citation." } }),
    );
    expect(await screen.findByText("Proposal rejected.")).toBeInTheDocument();

    await userEvent.click(approve);
    await waitFor(() => expect(calls).toContainEqual({ url: `${BASE}/cp_1/approve`, method: "POST", body: {} }));
    expect(await screen.findByText("Approved and applied to production.")).toBeInTheDocument();
    // Both panes refetch after an action.
    expect(calls.filter((call) => call.url === BASE).length).toBeGreaterThanOrEqual(3);
    expect(calls.filter((call) => call.url === `${BASE}/cp_1` && call.method === "GET").length).toBeGreaterThanOrEqual(3);
  });

  it("surfaces an approve that came back as changes requested with the conflict reason", async () => {
    stubQueueApi([submitted], { cp_1: submittedDetail }, {
      ok: true,
      status: "changes_requested",
      conflictReason: "Article lsd moved.",
    });
    render(<QueueTab canApprove />);

    await userEvent.click(await screen.findByRole("button", { name: /Update LSD/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Approve and apply" }));

    expect(await screen.findByText("Not applied: changes requested")).toBeInTheDocument();
    expect(screen.getByText("Article lsd moved.")).toBeInTheDocument();
  });

  it("offers revert only on an applied proposal and posts a comment with the typed text", async () => {
    const { calls } = stubQueueApi([applied], {
      cp_2: { ...applied, diff: "", comments: [], liveHashes: [{ kind: "article", key: "dmt", hash: "h-dmt" }] },
    });
    render(<QueueTab canApprove />);

    await userEvent.click(await screen.findByRole("button", { name: /Retitle DMT/ }));

    const revert = await screen.findByRole("button", { name: "Revert" });
    expect(screen.queryByRole("button", { name: "Approve and apply" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    await userEvent.click(revert);
    await waitFor(() => expect(calls).toContainEqual({ url: `${BASE}/cp_2/revert`, method: "POST", body: {} }));

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
});
