/**
 * Change Review task links: a proposal link opens the same proposal after a
 * reload, a removed one says so, a recommendation link picks its row out, and
 * My pending proposals lists exactly the rows its count counts.
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueueTab } from "./QueueTab";
import type { ProposalDetail, ProposalSummary, ReviewRecommendationRow } from "./queueModel";
import { isMyPendingProposal } from "./queueTaskLink";

const proposal = (id: string, summary: string, overrides: Partial<ProposalSummary> = {}): ProposalSummary => ({
  _id: id,
  proposerName: "Ada",
  isAuthor: false,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
  status: "submitted",
  targets: [{ kind: "article", key: "lsd", baseHash: "h-lsd" }],
  summary,
  commentCount: 0,
  ...overrides,
});

const rows = [
  proposal("cp_theirs", "Update LSD"),
  proposal("cp_mine", "Fix mescaline dose", { isAuthor: true }),
  proposal("cp_mine_returned", "Psilocybin onset", { isAuthor: true, status: "changes_requested" }),
  proposal("cp_mine_applied", "DMT title", { isAuthor: true, status: "applied" }),
];

const detailOf = (row: ProposalSummary): ProposalDetail => ({ ...row, diff: "", comments: [], liveHashes: [] });

const recommendation: ReviewRecommendationRow = {
  slug: "heroin",
  title: "Heroin",
  revision: "rev-heroin",
  recommended_by: "editor@example.com",
  recommended_at: "2026-09-20T10:00:00.000Z",
  note: "",
  publishedRevision: "rev-heroin",
  stale: false,
};

function stubApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/dev/proposals") return Response.json({ ok: true, proposals: rows });
      if (url === "/api/dev/review-recommendations") return Response.json({ ok: true, recommendations: [recommendation] });
      const id = url.slice("/api/dev/proposals/".length).split("?")[0];
      const found = rows.find((row) => row._id === id);
      return found
        ? Response.json({ ok: true, proposal: detailOf(found) })
        : Response.json({ ok: false, error: "No proposal with that id." }, { status: 404 });
    }),
  );
}

function renderQueue(props: Partial<Parameters<typeof QueueTab>[0]> = {}) {
  return render(<QueueTab canApprove onLoadIntoEditor={vi.fn(async () => undefined)} {...props} />);
}

const address = () => window.location.pathname + window.location.search;

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.history.replaceState(null, "", "/dev/queue");
  stubApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Change Review task links", () => {
  it("puts the picked proposal in the address, and reloading that link opens the same proposal", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(await screen.findByRole("button", { name: /Fix mescaline dose/ }));
    await waitFor(() => expect(address()).toBe("/dev/queue/cp_mine"));

    cleanup();
    // The route resolves the id from the path, as it does for the Inbox.
    renderQueue({ initialProposalId: "cp_mine" });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Fix mescaline dose/ })).toHaveAttribute("aria-pressed", "true"),
    );
  });

  it("says a removed or inaccessible proposal is gone instead of showing an empty review", async () => {
    window.history.replaceState(null, "", "/dev/queue/cp_deleted");
    renderQueue({ initialProposalId: "cp_deleted" });

    expect(await screen.findByText("This item no longer exists or you cannot open it")).toBeInTheDocument();
    expect(screen.queryByText("The submission did not load")).not.toBeInTheDocument();
    expect(screen.queryByText(/Select a submission/)).not.toBeInTheDocument();
  });

  it("lists exactly the rows My pending proposals counts, and keeps the view in the address", async () => {
    const user = userEvent.setup();
    renderQueue();

    const expected = rows.filter(isMyPendingProposal).length;
    const toggle = await screen.findByRole("button", { name: `My pending ${expected}` });
    await user.click(toggle);

    const listed = ["submitted", "changes_requested", "applied", "closed"].flatMap((id) =>
      screen.queryByTestId(`queue-group-${id}`) ? within(screen.getByTestId(`queue-group-${id}`)).getAllByRole("button") : [],
    );
    expect(listed).toHaveLength(expected);
    expect(listed.map((button) => button.textContent)).toEqual([
      expect.stringContaining("Fix mescaline dose"),
      expect.stringContaining("Psilocybin onset"),
    ]);
    expect(address()).toBe("/dev/queue?view=mine");

    await user.click(screen.getByRole("button", { name: /Fix mescaline dose/ }));
    await waitFor(() => expect(address()).toBe("/dev/queue/cp_mine?view=mine"));
  });

  it("opens on a linked review recommendation, picked out and ticked, and says when it is gone", async () => {
    window.history.replaceState(null, "", "/dev/queue?recommendation=heroin");
    renderQueue();

    const linked = await screen.findByTestId("recommendation-heroin");
    expect(linked).toHaveAttribute("aria-current", "true");
    await waitFor(() => expect(within(linked).getByRole("checkbox", { name: "Approve Heroin" })).toBeChecked());
    expect(screen.getByRole("button", { name: "Approve selected (1)" })).toBeEnabled();

    cleanup();
    window.history.replaceState(null, "", "/dev/queue?recommendation=fentanyl");
    renderQueue();
    expect(await screen.findByText("This item no longer exists or you cannot open it")).toBeInTheDocument();
  });
});
