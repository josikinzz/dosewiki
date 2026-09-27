import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getEmptyEditorLibrary } from "@/data/emptyLibrary";
import { SubstanceIndexProvider } from "@/data/SubstanceIndexProvider";
import { resetDevRailBadgesForTests } from "@/features/dev/pages/useDevRailBadges";
import { queueResponse } from "@/test/feedbackQueueServer";

import { InboxTab } from "./InboxTab";

const ADA = "ada@example.com";
const BEN = "ben@example.com";

const tripReport = {
  id: "sub-1",
  status: "submitted",
  schema_version: 1,
  report: {},
  title: "A quiet evening",
  author_name: "Sam",
  substance_names: ["Psilocybin"],
  may_contact: false,
  publish_consent: true,
  age_confirmed: true,
  honeypot_triggered: false,
  created_at: "2026-09-01T10:00:00.000Z",
  updated_at: "2026-09-01T10:00:00.000Z",
};

const articleFeedback = {
  id: "af-1",
  status: "new",
  schema_version: 1,
  substance_slug: "mescaline",
  substance_title: "Mescaline",
  category: "inaccurate",
  importance: "normal",
  details: "The oral duration looks off.",
  honeypot_triggered: false,
  created_at: "2026-08-20T12:00:00.000Z",
  updated_at: "2026-08-20T12:00:00.000Z",
};

const siteFeedback = {
  id: "sf-1",
  status: "new",
  schema_version: 1,
  category: "technical",
  urgency: "critical",
  details: "Search is down.",
  honeypot_triggered: false,
  created_at: "2026-09-10T12:00:00.000Z",
  updated_at: "2026-09-10T12:00:00.000Z",
};

const glossaryFeedback = {
  id: "gf-1",
  status: "new",
  locale: "de",
  term: "Toleranz",
  target: "Toleranz",
  version: "v1",
  alternative: "",
  details: "Reads oddly.",
  created_at: "2026-08-25T12:00:00.000Z",
};

const citation = {
  slug: "lsd",
  articleId: 1,
  totalRows: 4,
  supportedCount: 1,
  needsSourceCount: 1,
  needsReviewCount: 1,
  approvedCount: 1,
  rejectedCount: 0,
  blockingCount: 0,
  blockingNeedsSourceCount: 0,
  blockingNeedsReviewCount: 0,
  blockingSupportedCount: 0,
  blockingRejectedCount: 0,
  diagnosticErrorCount: 0,
  diagnosticWarningCount: 0,
  sectionIds: [],
  updatedAt: "2026-08-15T12:00:00.000Z",
};

const proposal = {
  _id: "prop-1",
  proposerName: "Editor Eve",
  isAuthor: false,
  createdAt: "2026-08-10T12:00:00.000Z",
  updatedAt: "2026-08-10T12:00:00.000Z",
  status: "submitted",
  targets: [{ kind: "article", key: "ketamine", baseHash: "h" }],
  summary: "Fix ketamine duration",
  commentCount: 0,
};

const recommendation = {
  slug: "dmt",
  title: "DMT",
  revision: "rev1",
  recommended_by: "editor@example.com",
  recommended_at: "2026-08-30T12:00:00.000Z",
  note: "",
  publishedRevision: "rev1",
  stale: false,
};

type Server = {
  trip: Record<string, unknown>[];
  article: Record<string, unknown>[];
  site: Record<string, unknown>[];
  glossary: Record<string, unknown>[];
  claims: Record<string, unknown>[];
};

/**
 * Every Inbox source behind one mocked network. Status writes update the
 * shared rows as the routes would (moving the status and appending the
 * actor's decision), so a second render sees what the first one claimed.
 */
function stubServer(server: Server, actor: () => string) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://dose.wiki");
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    const post = init?.method === "POST";
    const decide = (rows: Record<string, unknown>[], id: string) => {
      const row = rows.find((entry) => entry.id === id)!;
      const log = (row.decision_log as unknown[] | undefined) ?? [];
      Object.assign(row, {
        status: body.status,
        reviewed_by: actor(),
        decision_log: [...log, { at: "2026-09-25T00:00:00.000Z", actor: actor(), from: row.status, to: body.status }],
      });
      return row;
    };

    if (url.pathname === "/api/dev/inbox/claims") {
      if (post) {
        // Claim, take over and release all replace whatever the item held.
        server.claims = server.claims.filter((entry) => entry.source !== body.source || entry.item_id !== body.id);
        if (body.action === "release") return Response.json({ ok: true, released: true });
        const claim = { source: body.source, item_id: body.id, claimed_by: actor(), claimed_at: "2026-09-25T00:00:00.000Z" };
        server.claims.push(claim);
        return Response.json({ ok: true, claim });
      }
      return Response.json({ ok: true, claims: server.claims });
    }
    if (url.pathname === "/api/trip-report-submissions/queue") {
      return Response.json({ ok: true, submissions: server.trip });
    }
    const tripStatus = /^\/api\/trip-report-submissions\/([^/]+)\/status$/.exec(url.pathname);
    if (tripStatus && post) {
      return Response.json({ ok: true, submission: decide(server.trip, tripStatus[1]) });
    }
    if (url.pathname === "/api/article-feedback/queue") return queueResponse(input, server.article as never);
    if (url.pathname === "/api/site-feedback/queue") return queueResponse(input, server.site as never);
    const feedbackStatus = /^\/api\/(article|site|glossary)-feedback\/([^/]+)\/status$/.exec(url.pathname);
    if (feedbackStatus && post) {
      const rows = feedbackStatus[1] === "article" ? server.article : feedbackStatus[1] === "site" ? server.site : server.glossary;
      return Response.json({ ok: true, feedback: decide(rows, feedbackStatus[2]) });
    }
    if (url.pathname === "/api/glossary-feedback/queue") {
      return Response.json({ ok: true, locale: "de", locales: ["de"], feedback: server.glossary });
    }
    if (url.pathname === "/api/citation-evidence/queue") return Response.json({ ok: true, queue: [citation] });
    if (url.pathname === "/api/dev/proposals") return Response.json({ ok: true, proposals: [proposal] });
    if (url.pathname === "/api/dev/review-recommendations") {
      return Response.json({ ok: true, recommendations: [recommendation] });
    }
    return Response.json({ error: `unexpected ${url.pathname}` }, { status: 500 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function freshServer(): Server {
  return {
    trip: [structuredClone(tripReport)],
    article: [structuredClone(articleFeedback)],
    site: [structuredClone(siteFeedback)],
    glossary: [structuredClone(glossaryFeedback)],
    claims: [],
  };
}

async function openInbox(actorEmail: string) {
  const view = render(<InboxTab actorEmail={actorEmail} />);
  const list = await screen.findByRole("listbox", { name: "Inbox items" });
  await waitFor(() => expect(within(list).getAllByRole("option")).toHaveLength(7));
  return { ...view, list };
}

function optionTitles(list: HTMLElement) {
  return within(list).getAllByRole("option").map((option) => option.querySelector(".font-semibold")?.textContent);
}

function selectedTitle(list: HTMLElement) {
  return within(list).getAllByRole("option").find((option) => option.getAttribute("aria-selected") === "true")
    ?.querySelector(".font-semibold")?.textContent;
}

describe("InboxTab", () => {
  let actor = ADA;

  beforeEach(() => {
    actor = ADA;
    resetDevRailBadgesForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists items from every source, most urgent first and then oldest first", async () => {
    stubServer(freshServer(), () => actor);
    const { list } = await openInbox(ADA);

    expect(optionTitles(list)).toEqual([
      // Critical site feedback leads whatever its age.
      "Website technical issue",
      // The rest are normal urgency, oldest first.
      "Fix ketamine duration",
      "lsd",
      "Mescaline",
      "Toleranz",
      "DMT",
      "A quiet evening",
    ]);
    for (const source of ["Trip report", "Article feedback", "Site feedback", "Glossary feedback", "Citations", "Proposal", "Review recommendation"]) {
      expect(within(list).getByText(source)).toBeInTheDocument();
    }
  });

  it("filters by source chip", async () => {
    stubServer(freshServer(), () => actor);
    const { list } = await openInbox(ADA);
    const user = userEvent.setup();

    await user.click(within(screen.getByRole("group", { name: "Source" })).getByRole("button", { name: /Change Review/ }));
    expect(optionTitles(list)).toEqual(["Fix ketamine duration", "DMT"]);
  });

  it("shows a status-claimed item's claimer to another admin", async () => {
    const server = freshServer();
    const fetchMock = stubServer(server, () => actor);
    const first = await openInbox(ADA);
    const user = userEvent.setup();

    await user.click(within(first.list).getByText("Mescaline"));
    await user.click(screen.getByRole("button", { name: "Claim" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/article-feedback/af-1/status",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ status: "reviewing" }) }),
    );
    expect(await screen.findByText("You are reviewing this.")).toBeInTheDocument();
    first.unmount();

    actor = BEN;
    const second = await openInbox(BEN);
    await user.click(within(second.list).getByText("Mescaline"));
    expect(screen.getByText(`Claimed by ${ADA}.`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Claim" })).not.toBeInTheDocument();

    // Ben's Unassigned view no longer offers it; Ada's Mine view would.
    await user.click(within(screen.getByRole("group", { name: "Assigned to" })).getByRole("button", { name: /^Unassigned/ }));
    expect(optionTitles(second.list)).not.toContain("Mescaline");
  });

  it("shows a claimed proposal's claimer to another admin", async () => {
    const server = freshServer();
    const fetchMock = stubServer(server, () => actor);
    const first = await openInbox(ADA);
    const user = userEvent.setup();

    await user.click(within(first.list).getByText("Fix ketamine duration"));
    await user.click(screen.getByRole("button", { name: "Claim" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dev/inbox/claims",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "claim", source: "proposals", id: "prop-1" }) }),
    );
    expect(await screen.findByText("You are reviewing this.")).toBeInTheDocument();
    first.unmount();

    actor = BEN;
    const second = await openInbox(BEN);
    await user.click(within(second.list).getByText("Fix ketamine duration"));
    expect(screen.getByText(`Claimed by ${ADA}.`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open in Change Review/ })).toHaveAttribute("href", "/dev/queue/prop-1");
  });

  it("triages across sources with the shared keys", async () => {
    const server = freshServer();
    const fetchMock = stubServer(server, () => actor);
    const { list } = await openInbox(ADA);
    const user = userEvent.setup();

    // j walks the one list regardless of which tool owns each row.
    await user.keyboard("j");
    expect(selectedTitle(list)).toBe("Website technical issue");
    await user.keyboard("j");
    expect(selectedTitle(list)).toBe("Fix ketamine duration");

    // A proposal is decided in Change Review, with its own confirm.
    await user.keyboard("a");
    expect(screen.getByText("Change Review makes this decision. Use Open in Change Review.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/approve"), expect.anything());

    // k back to site feedback: r asks, then rejects it out of the Inbox.
    await user.keyboard("k");
    expect(selectedTitle(list)).toBe("Website technical issue");
    await user.keyboard("r");
    const dialog = await screen.findByRole("dialog", { name: "Reject this item?" });
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/site-feedback/sf-1/status",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ status: "rejected" }) }),
    );
    await waitFor(() => expect(optionTitles(list)).not.toContain("Website technical issue"));

    // The trip report is last: a accepts it, and it stays in the Inbox as Accepted.
    await user.keyboard("jjjjjj");
    expect(selectedTitle(list)).toBe("A quiet evening");
    await user.keyboard("a");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trip-report-submissions/sub-1/status",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ status: "accepted" }) }),
    );
    await waitFor(() =>
      expect(within(list).getAllByRole("option").slice(-1)[0]).toHaveTextContent("Accepted"),
    );
  });

  it("lets another admin take over a claim only after confirming", async () => {
    const server = freshServer();
    server.claims.push({ source: "proposals", item_id: "prop-1", claimed_by: ADA, claimed_at: "2026-09-25T00:00:00.000Z", expired: false });
    actor = BEN;
    const fetchMock = stubServer(server, () => actor);
    const { list } = await openInbox(BEN);
    const user = userEvent.setup();
    const takeOverPosts = () =>
      fetchMock.mock.calls.filter(([, init]) => String(init?.body ?? "").includes('"takeover"'));

    await user.click(within(list).getByText("Fix ketamine duration"));
    expect(screen.getByText(`Claimed by ${ADA}.`)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Take over" }));
    const dialog = await screen.findByRole("dialog", { name: "Take over this claim?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(takeOverPosts()).toHaveLength(0);
    expect(screen.getByText(`Claimed by ${ADA}.`)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Take over" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Take over" }));
    expect(await screen.findByText("You are reviewing this.")).toBeInTheDocument();
    expect(takeOverPosts()).toEqual([
      ["/api/dev/inbox/claims", expect.objectContaining({ body: JSON.stringify({ action: "takeover", source: "proposals", id: "prop-1" }) })],
    ]);
    expect(server.claims).toEqual([expect.objectContaining({ item_id: "prop-1", claimed_by: BEN })]);
  });

  it("names a citation row by its article title once the corpus has loaded", async () => {
    stubServer(freshServer(), () => ADA);
    const library = {
      ...getEmptyEditorLibrary(),
      allSubstanceRecords: [{ slug: "lsd", name: "LSD" }],
    } as unknown as Parameters<typeof SubstanceIndexProvider>[0]["libraryData"];
    render(
      <SubstanceIndexProvider libraryData={library}>
        <InboxTab actorEmail={ADA} />
      </SubstanceIndexProvider>,
    );
    const list = await screen.findByRole("listbox", { name: "Inbox items" });
    await waitFor(() => expect(within(list).getAllByRole("option")).toHaveLength(7));
    expect(within(list).getByText("LSD")).toBeInTheDocument();
    expect(within(list).queryByText("lsd")).not.toBeInTheDocument();
  });

  it("shows an expired claim as unclaimed, with who held it", async () => {
    const server = freshServer();
    server.claims.push({ source: "citations", item_id: "lsd", claimed_by: ADA, claimed_at: "2026-09-20T00:00:00.000Z", expired: true });
    actor = BEN;
    stubServer(server, () => actor);
    const { list } = await openInbox(BEN);
    const user = userEvent.setup();

    await user.click(within(list).getByText("lsd"));
    expect(screen.getByText(/^Claim expired\. ada@example\.com claimed this/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Take over" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Claim" }));
    expect(await screen.findByText("You are reviewing this.")).toBeInTheDocument();
  });

  it("undoes the last decision with u, through the same status route", async () => {
    const server = freshServer();
    const fetchMock = stubServer(server, () => actor);
    const { list } = await openInbox(ADA);
    const user = userEvent.setup();

    await user.keyboard("j");
    expect(selectedTitle(list)).toBe("Website technical issue");
    await user.keyboard("a");
    await waitFor(() => expect(optionTitles(list)).not.toContain("Website technical issue"));
    expect(await screen.findByRole("button", { name: "Undo" })).toBeInTheDocument();

    await user.keyboard("u");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/site-feedback/sf-1/status",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ status: "reviewing" }) }),
    );
    await waitFor(() => expect(selectedTitle(list)).toBe("Website technical issue"));
    expect(screen.getByText(/^Undone\./)).toBeInTheDocument();
  });

  it("offers a way back when the filters hide everything", async () => {
    stubServer(freshServer(), () => actor);
    const { list } = await openInbox(ADA);
    const user = userEvent.setup();

    await user.click(within(screen.getByRole("group", { name: "Assigned to" })).getByRole("button", { name: /^Mine/ }));
    expect(within(list).queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("Nothing matches these filters.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show everything" }));
    await waitFor(() => expect(within(list).getAllByRole("option")).toHaveLength(7));
  });

  it("folds every failed queue into one error with one retry", async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: "Database unavailable." }, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<InboxTab actorEmail={ADA} />);

    expect(await screen.findByText("Could not load the Inbox")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(1);
  });
});
