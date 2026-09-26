/**
 * Change Review's review pane and decision dock: approve refuses what the
 * server would refuse and says why, keys never get past a confirm, the hold
 * line reads and writes the Inbox's claims, and results stay with the
 * proposal they came from.
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QueueTab } from "./QueueTab";
import type { ProposalDetail, ProposalSummary } from "./queueModel";

const BASE = "/api/dev/proposals";
const CLAIMS = "/api/dev/inbox/claims";
const ME = "admin@example.com";

const summary = (overrides: Partial<ProposalSummary>): ProposalSummary => ({
  _id: "cp_1",
  proposerName: "Ada",
  isAuthor: false,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
  status: "submitted",
  targets: [{ kind: "article", key: "lsd", baseHash: "h-lsd" }],
  summary: "Update LSD",
  commentCount: 0,
  ...overrides,
});

const detailOf = (row: ProposalSummary, overrides: Partial<ProposalDetail> = {}): ProposalDetail => {
  const { commentCount: _count, ...rest } = row;
  return {
    ...rest,
    diff: "# LSD\n\n- Stored summary\n+ Proposed summary",
    comments: [],
    liveHashes: row.targets.map((target) => ({ kind: target.kind, key: target.key, hash: target.baseHash })),
    ...overrides,
  };
};

type Call = { url: string; method: string; body: Record<string, unknown> | null };

function stub(rows: ProposalSummary[], details: Record<string, ProposalDetail>, answers: Record<string, () => Response> = {}) {
  const calls: Call[] = [];
  let claims: Array<Record<string, unknown>> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });
    const key = `${method} ${url}`;
    if (answers[key]) return answers[key]();
    if (url === CLAIMS && method === "GET") return Response.json({ ok: true, claims });
    if (url === CLAIMS && method === "POST") {
      claims = claims.filter((claim) => claim.item_id !== body.id);
      if (body.action === "release") return Response.json({ ok: true, released: true });
      const claim = { source: "proposals", item_id: body.id, claimed_by: ME, claimed_at: "2026-09-02T10:00:00.000Z" };
      claims.push(claim);
      return Response.json({ ok: true, claim });
    }
    if (url === BASE) return Response.json({ ok: true, proposals: rows });
    if (url === "/api/dev/review-recommendations") return Response.json({ ok: true, recommendations: [] });
    if (method === "POST") return Response.json({ ok: true, status: "applied" });
    const id = url.slice(BASE.length + 1).split("?")[0];
    return details[id] ? Response.json({ ok: true, proposal: details[id] }) : Response.json({ error: "No proposal." }, { status: 404 });
  }));
  return calls;
}

const renderAdmin = () => render(<QueueTab canApprove actorEmail={ME} onLoadIntoEditor={vi.fn(async () => undefined)} />);
const dock = () => within(screen.getByRole("contentinfo", { name: "Decision" }));
const posts = (calls: Call[]) => calls.filter((call) => call.method === "POST");

describe("Change Review decision dock", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps Approve off with the reason when the comparison cannot be verified", async () => {
    const row = summary({});
    stub([row], { cp_1: detailOf(row, { comparisonMode: "unavailable", comparisonNote: "No stored comparison." }) });
    renderAdmin();
    await userEvent.click(await screen.findByRole("button", { name: /Update LSD/ }));
    expect(await dock().findByRole("button", { name: "Approve and apply" })).toBeDisabled();
    expect(dock().getByText("There is no verifiable comparison, so it cannot be approved here.")).toBeInTheDocument();
  });

  it("opens the approve confirm with a, names the proposal, and writes nothing until confirmed", async () => {
    const row = summary({});
    const calls = stub([row], { cp_1: detailOf(row) });
    renderAdmin();
    await userEvent.click(await screen.findByRole("button", { name: /Update LSD/ }));
    await dock().findByRole("button", { name: "Approve and apply" });
    await userEvent.keyboard("a");
    const dialog = await screen.findByRole("dialog", { name: "Apply to production?" });
    expect(dialog).toHaveTextContent("“Update LSD” by Ada.");
    expect(posts(calls).filter((call) => call.url.endsWith("/approve"))).toEqual([]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts(calls).filter((call) => call.url.startsWith(BASE))).toEqual([]);
  });

  it("never lets a key approve an admin's own proposal", async () => {
    const row = summary({ isAuthor: true });
    const calls = stub([row], { cp_1: detailOf(row) });
    renderAdmin();
    await userEvent.click(await screen.findByRole("button", { name: /Update LSD/ }));
    expect(await dock().findByRole("button", { name: "Approve and apply" })).toBeDisabled();
    expect(dock().getByText("You cannot approve your own proposal. Another admin must.")).toBeInTheDocument();
    await userEvent.keyboard("a");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(posts(calls).filter((call) => call.url.startsWith(BASE))).toEqual([]);
  });

  it("sends r to the rejection note while it is empty, and to the confirm once written", async () => {
    const row = summary({});
    stub([row], { cp_1: detailOf(row) });
    renderAdmin();
    await userEvent.click(await screen.findByRole("button", { name: /Update LSD/ }));
    await dock().findByText(/Reject needs a note the proposer will read/);
    await userEvent.keyboard("r");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Rejection note")).toHaveFocus();
    await userEvent.type(screen.getByLabelText("Rejection note"), "Needs a source.");
    await userEvent.click(document.body);
    await userEvent.keyboard("r");
    expect(await screen.findByRole("dialog", { name: "Reject this proposal?" })).toHaveTextContent("Needs a source.");
  });

  it("shows who holds a waiting proposal and claims it through the Inbox's claim route", async () => {
    const row = summary({});
    const calls = stub([row], { cp_1: detailOf(row) });
    renderAdmin();
    await userEvent.click(await screen.findByRole("button", { name: /Update LSD/ }));
    expect(await dock().findByText("Nobody has claimed this yet.")).toBeInTheDocument();
    await userEvent.click(dock().getByRole("button", { name: "Claim" }));
    await waitFor(() =>
      expect(calls).toContainEqual({ url: CLAIMS, method: "POST", body: { action: "claim", source: "proposals", id: "cp_1" } }),
    );
    expect(await dock().findByText(/You are reviewing this/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Update LSD/ })).toHaveTextContent("You are reviewing");
    await userEvent.click(dock().getByRole("button", { name: "Release" }));
    expect(await dock().findByText("Nobody has claimed this yet.")).toBeInTheDocument();
  });

  it("reads a refused write under the freeze as the freeze", async () => {
    const row = summary({});
    stub([row], { cp_1: detailOf(row) }, {
      [`POST ${BASE}/cp_1/approve`]: () =>
        Response.json({ error: "Data writes are frozen.", code: "DATA_WRITES_FROZEN" }, { status: 503 }),
    });
    renderAdmin();
    await userEvent.click(await screen.findByRole("button", { name: /Update LSD/ }));
    await userEvent.click(await dock().findByRole("button", { name: "Approve and apply" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Apply to production" }));
    expect(await dock().findByText("Writes are paused, so that was not saved. Try again once they resume.")).toBeInTheDocument();
  });

  it("keeps a decision's result with its proposal and offers the next waiting one", async () => {
    const first = summary({});
    const second = summary({ _id: "cp_2", summary: "Retitle DMT", targets: [{ kind: "article", key: "dmt", baseHash: "h" }] });
    stub([first, second], { cp_1: detailOf(first), cp_2: detailOf(second) });
    renderAdmin();
    await userEvent.click(await screen.findByRole("button", { name: /Update LSD/ }));
    await userEvent.click(await dock().findByRole("button", { name: "Approve and apply" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Apply to production" }));
    expect(await dock().findByText("Approved and published.")).toBeInTheDocument();
    await userEvent.click(dock().getByRole("button", { name: "Next waiting: Retitle DMT" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Retitle DMT/ })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.queryByText("Approved and published.")).toBeNull();
  });

  it("links a superseded proposal to the revision that replaced it", async () => {
    const old = summary({ _id: "cp_old", status: "superseded", summary: "First try" });
    const revision = summary({ _id: "cp_new", summary: "Second try", revisionOf: "cp_old" });
    stub([revision, old], { cp_old: detailOf(old), cp_new: detailOf(revision) });
    renderAdmin();
    await userEvent.click(await screen.findByRole("button", { name: /First try/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Open the newer revision: Second try" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Second try/ })).toHaveAttribute("aria-pressed", "true"));
  });

  it("searches summaries, people and items, and says when nothing matches", async () => {
    stub([summary({}), summary({ _id: "cp_2", summary: "Retitle DMT", proposerName: "River", targets: [{ kind: "article", key: "dmt", baseHash: "h" }] })], {});
    renderAdmin();
    await screen.findByRole("button", { name: /Update LSD/ });
    await userEvent.type(screen.getByRole("searchbox", { name: "Search proposals" }), "river");
    expect(screen.queryByRole("button", { name: /Update LSD/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Retitle DMT/ })).toBeInTheDocument();
    await userEvent.clear(screen.getByRole("searchbox", { name: "Search proposals" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search proposals" }), "zzz");
    expect(screen.getByText("No proposal matches “zzz”.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear the search" }));
    expect(screen.getByRole("button", { name: /Update LSD/ })).toBeInTheDocument();
  });
});
