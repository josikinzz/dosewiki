/**
 * Change Review's Review recommendations lane: an admin approves editors'
 * recommendations many at a time behind one confirm, and a stale one cannot
 * be approved without another review.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QueueTab } from "./QueueTab";
import type { ReviewRecommendationRow } from "./queueModel";

const RECOMMENDATIONS = "/api/dev/review-recommendations";

const row = (slug: string, title: string, overrides: Partial<ReviewRecommendationRow> = {}): ReviewRecommendationRow => ({
  slug,
  title,
  revision: `rev-${slug}`,
  recommended_by: "editor@example.com",
  recommended_at: "2026-09-20T10:00:00.000Z",
  note: "",
  publishedRevision: `rev-${slug}`,
  stale: false,
  ...overrides,
});

const ready = [
  row("heroin", "Heroin", { note: "Doses match the sources" }),
  row("morphine", "Morphine"),
  row("codeine", "Codeine"),
];
const stale = row("fentanyl", "Fentanyl", { publishedRevision: "rev-newer", stale: true });

type Call = { url: string; method: string; body: Record<string, unknown> | null };

function stubApi(initial: ReviewRecommendationRow[]) {
  const calls: Call[] = [];
  let rows = initial;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      calls.push({ url, method, body });
      if (url === RECOMMENDATIONS && method === "POST") {
        const slugs = (body?.items as Array<{ slug: string }>).map((item) => item.slug);
        rows = rows.filter((candidate) => !slugs.includes(candidate.slug));
        return Response.json({ ok: true, approved: slugs, stale: [], missing: [] });
      }
      if (url === RECOMMENDATIONS) return Response.json({ ok: true, recommendations: rows });
      return Response.json({ ok: true, proposals: [] });
    }),
  );
  return calls;
}

function renderAdminQueue() {
  render(<QueueTab canApprove onLoadIntoEditor={vi.fn(async () => undefined)} />);
}

const lane = () => within(screen.getByRole("list", { name: "Review recommendations" }));

/** The lane is Change Review's second view; open it the way an admin does. */
async function openLane() {
  await userEvent.click(await screen.findByRole("tab", { name: /^Recommendations/ }));
  await screen.findByRole("list", { name: "Review recommendations" });
}

describe("Review recommendations lane", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("approves three recommendations with one confirm, each at its recommended revision", async () => {
    const calls = stubApi([...ready, stale]);
    renderAdminQueue();
    await openLane();

    for (const title of ["Heroin", "Morphine", "Codeine"]) {
      await userEvent.click(lane().getByRole("checkbox", { name: `Approve ${title}` }));
    }
    await userEvent.click(screen.getByRole("button", { name: "Approve selected (3)" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Mark 3 articles reviewed?");
    expect(dialog).toHaveTextContent("Heroin");
    expect(dialog).toHaveTextContent("Codeine");
    // The recommender and their note stay in view at the moment of sign-off.
    expect(dialog).toHaveTextContent("Recommended by editor@example.com");
    expect(dialog).toHaveTextContent("Doses match the sources");
    await userEvent.click(within(dialog).getByRole("button", { name: "Approve 3" }));

    await waitFor(() => expect(screen.getByText("Marked 3 articles reviewed.")).toBeInTheDocument());
    const approvals = calls.filter((call) => call.url === RECOMMENDATIONS && call.method === "POST");
    expect(approvals).toHaveLength(1);
    expect(approvals[0].body).toEqual({
      items: [
        { slug: "heroin", revision: "rev-heroin" },
        { slug: "morphine", revision: "rev-morphine" },
        { slug: "codeine", revision: "rev-codeine" },
      ],
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(lane().queryByText("Heroin")).toBeNull());
  });

  it("shows a stale recommendation as stale and never lets it be approved", async () => {
    const calls = stubApi([ready[0], stale]);
    renderAdminQueue();
    await openLane();

    const staleRow = within(screen.getByTestId("recommendation-fentanyl"));
    expect(staleRow.getByText("Stale")).toBeInTheDocument();
    expect(staleRow.getByText("Changed since recommended.")).toBeInTheDocument();
    expect(staleRow.getByRole("checkbox", { name: "Approve Fentanyl" })).toBeDisabled();
    expect(staleRow.getByRole("link", { name: "Review again" })).toHaveAttribute("href", "/review/fentanyl");

    await userEvent.click(screen.getByRole("button", { name: "Select all ready" }));
    await userEvent.click(screen.getByRole("button", { name: "Approve selected (1)" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Approve 1" }));

    await waitFor(() => expect(calls.some((call) => call.method === "POST")).toBe(true));
    const [approval] = calls.filter((call) => call.url === RECOMMENDATIONS && call.method === "POST");
    expect(approval.body).toEqual({ items: [{ slug: "heroin", revision: "rev-heroin" }] });
  });

  it("is not offered to editors", async () => {
    stubApi([...ready]);
    render(<QueueTab canApprove={false} onLoadIntoEditor={vi.fn(async () => undefined)} />);
    await screen.findByText("My submissions");
    expect(screen.queryByText("Review recommendations")).toBeNull();
    expect(screen.queryByRole("tab", { name: /Recommendations/ })).toBeNull();
  });
});
