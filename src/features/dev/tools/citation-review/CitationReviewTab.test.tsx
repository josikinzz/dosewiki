import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetDevRailBadgesForTests, useDevRailBadges } from "@/features/dev/pages/useDevRailBadges";

import { CitationReviewTab } from "./CitationReviewTab";
import type { CitationEvidenceRow, CitationReviewQueueSummary } from "./citationReviewModels";

vi.mock("../../context/DevModeContext", () => ({
  useDevMode: () => ({
    articles: [],
    articleHydration: {
      isArticleHydrated: () => false,
      requestArticle: () => {},
    },
  }),
}));

vi.mock("@/data/SubstanceIndexProvider", () => ({
  useLibrary: () => ({ allSubstanceRecords: [{ slug: "lsd", name: "LSD" }] }),
}));

const verifiedSupport = {
  sourceId: "source-1",
  sourceName: "Source",
  referenceId: "ref-1",
  supportingQuote: "Quote",
  rationale: "Rationale",
  verifiedQuote: {
    sourceId: "source-1",
    matchType: "exact" as const,
    startOffset: 0,
    endOffset: 5,
  },
};

function createRow(overrides: Partial<CitationEvidenceRow>): CitationEvidenceRow {
  return {
    section: "summary",
    claimKey: "summary:0",
    referenceIds: ["ref-1"],
    status: "supported",
    severity: "blocking",
    supports: [verifiedSupport],
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

const rows: CitationEvidenceRow[] = [
  createRow({ claimKey: "summary:ready", claimText: "Ready claim", status: "supported" }),
  createRow({ claimKey: "summary:approved", claimText: "Approved claim", status: "approved" }),
  createRow({ claimKey: "summary:rejected", claimText: "Rejected claim", status: "rejected" }),
];

const openSummary: CitationReviewQueueSummary = {
  slug: "lsd",
  articleId: 1,
  totalRows: 3,
  supportedCount: 1,
  needsSourceCount: 0,
  needsReviewCount: 0,
  approvedCount: 1,
  rejectedCount: 1,
  blockingCount: 3,
  blockingNeedsSourceCount: 0,
  blockingNeedsReviewCount: 0,
  blockingSupportedCount: 1,
  blockingRejectedCount: 1,
  diagnosticErrorCount: 0,
  diagnosticWarningCount: 0,
  sectionIds: ["summary"],
  updatedAt: "2026-05-01T00:00:00.000Z",
};

type StatusPost = { slug: string; claimKeys: string[]; status: string; statusReason?: string };

function stubQueue(
  queueByFilter: Record<string, CitationReviewQueueSummary[]>,
  options: { posts?: StatusPost[]; queueFailure?: { status: number; body: unknown } } = {},
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "https://dose.wiki");
      if (url.pathname === "/api/citation-evidence/queue") {
        if (options.queueFailure) {
          return Response.json(options.queueFailure.body, { status: options.queueFailure.status });
        }
        const status = url.searchParams.get("status") ?? "";
        return Response.json({ ok: true, queue: queueByFilter[status] ?? [] });
      }

      if (url.pathname === "/api/citation-evidence") {
        return Response.json({ ok: true, rows });
      }

      if (url.pathname === "/api/citation-evidence/status" && init?.method === "POST") {
        options.posts?.push(JSON.parse(String(init.body)) as StatusPost);
        return Response.json({ ok: true, updated: 1 });
      }

      return Response.json({ error: "unexpected" }, { status: 500 });
    }),
  );
}

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  stubQueue({ open: [openSummary], all: [openSummary] });
});

describe("CitationReviewTab", () => {
  it("loads the open queue by default and selects the first article", async () => {
    render(<CitationReviewTab />);

    expect(await screen.findByText("Ready claim")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/citation-evidence/queue?status=open", undefined);
    expect(fetch).toHaveBeenCalledWith("/api/citation-evidence?slug=lsd", undefined);

    const filter = screen.getByRole("group", { name: "Queue filter" });
    expect(within(filter).getByRole("button", { name: "Open" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Open in Review" })).toHaveAttribute(
      "href",
      "/review/lsd",
    );
  });

  it("refetches the queue with the chosen filter and explains an empty result", async () => {
    const user = userEvent.setup();
    render(<CitationReviewTab />);

    await screen.findByText("Ready claim");
    const filter = screen.getByRole("group", { name: "Queue filter" });
    await user.click(within(filter).getByRole("button", { name: "Approved" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/citation-evidence/queue?status=approved", undefined),
    );
    expect(await screen.findByText("No evidence rows match this filter")).toBeInTheDocument();
    expect(
      screen.getByText(/No articles have evidence rows matching the approved filter/),
    ).toBeInTheDocument();

    // The filter control survives the empty state so the reviewer can switch back.
    const emptyFilter = screen.getByRole("group", { name: "Queue filter" });
    expect(within(emptyFilter).getByRole("button", { name: "Approved" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(within(emptyFilter).getByRole("button", { name: "All" }));
    expect(await screen.findByText("Ready claim")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/citation-evidence/queue?status=all", undefined);
  });

  it("disables the verdict button a row already holds", async () => {
    const user = userEvent.setup();
    render(<CitationReviewTab />);

    async function expectDecisions(
      claimText: string,
      expected: { approveDisabled: boolean; rejectDisabled: boolean },
    ) {
      const toggle = await screen.findByRole("button", { name: new RegExp(claimText) });
      await user.click(toggle);
      const group = screen.getByRole("group", { name: "Evidence row decision actions" });
      const approve = within(group).getByRole("button", { name: "Approve" });
      const reject = within(group).getByRole("button", { name: "Reject" });
      expect(approve.hasAttribute("disabled")).toBe(expected.approveDisabled);
      expect(reject.hasAttribute("disabled")).toBe(expected.rejectDisabled);
      // Collapse again so only one decision group is mounted at a time.
      await user.click(toggle);
    }

    await expectDecisions("Ready claim", { approveDisabled: false, rejectDisabled: false });
    await expectDecisions("Approved claim", { approveDisabled: true, rejectDisabled: false });
    await expectDecisions("Rejected claim", { approveDisabled: false, rejectDisabled: true });
  });

  it("keeps the article-wide approval locked until a row is opened, then confirms with the sections touched", async () => {
    const user = userEvent.setup();
    const posts: StatusPost[] = [];
    stubQueue({ open: [openSummary] }, { posts });
    render(<CitationReviewTab />);

    const approveAll = await screen.findByRole("button", { name: "Approve 1 ready row" });
    expect(approveAll).toBeDisabled();
    expect(screen.getByText(/Open each ready row above before approving the set/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Ready claim/ }));
    expect(approveAll).toBeEnabled();

    await user.click(approveAll);
    const dialog = await screen.findByRole("dialog", { name: "Approve 1 ready row for LSD?" });
    expect(within(dialog).getByText("Summary: 1 row")).toBeInTheDocument();
    expect(posts).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: "Approve 1 row" }));
    await waitFor(() => expect(posts).toEqual([{ slug: "lsd", claimKeys: ["summary:ready"], status: "approved" }]));

    // The landed decision offers an undo that restores the row's prior status.
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]).toEqual({ slug: "lsd", claimKeys: ["summary:ready"], status: "supported" });
  });

  it("refreshes the rail's open-article count after a decision", async () => {
    const user = userEvent.setup();
    resetDevRailBadgesForTests();
    stubQueue({ open: [openSummary] }, { posts: [] });
    const queueFetch = vi.mocked(fetch).getMockImplementation()!;
    const openCounts = [1, 0];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input) === "/api/citation-evidence/open-count") {
        return Response.json({ ok: true, count: openCounts.length > 1 ? openCounts.shift() : openCounts[0] });
      }
      if (String(input).includes("-count") || String(input).endsWith("/count")) {
        return Response.json({ ok: true, count: 0, total: 0, article: 0, site: 0, submitted: 0 });
      }
      return queueFetch(input, init);
    });

    function Badge() {
      const count = useDevRailBadges("admin").citations;
      return <span data-testid="badge">{count === undefined ? "none" : String(count)}</span>;
    }

    render(
      <>
        <Badge />
        <CitationReviewTab />
      </>,
    );

    await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent("1"));
    await user.click(await screen.findByRole("button", { name: /Ready claim/ }));
    const group = screen.getByRole("group", { name: "Evidence row decision actions" });
    await user.click(within(group).getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(screen.getByTestId("badge")).toHaveTextContent("none"));
  });

  it("asks for a reason before rejecting and saves it with the row", async () => {
    const user = userEvent.setup();
    const posts: StatusPost[] = [];
    stubQueue({ open: [openSummary] }, { posts });
    render(<CitationReviewTab />);

    await user.click(await screen.findByRole("button", { name: /Ready claim/ }));
    const group = screen.getByRole("group", { name: "Evidence row decision actions" });
    await user.click(within(group).getByRole("button", { name: "Reject" }));
    expect(posts).toHaveLength(0);

    await user.selectOptions(screen.getByLabelText("Why is this row rejected?"), "wrong_source");
    await user.type(screen.getByLabelText("Detail (optional)"), "Cites the 2012 review, not the trial");
    await user.click(screen.getByRole("button", { name: "Reject row" }));

    await waitFor(() => expect(posts).toEqual([
      {
        slug: "lsd",
        claimKeys: ["summary:ready"],
        status: "rejected",
        statusReason: "Wrong source: Cites the 2012 review, not the trial",
      },
    ]));
    expect(await screen.findByText("Rejected 1 row")).toBeInTheDocument();
  });

  it("recovers the queue after retry and keeps a path to the Review portal while unavailable", async () => {
    const user = userEvent.setup();
    stubQueue(
      {},
      {
        queueFailure: {
          status: 502,
          body: { error: "The data server could not run the queue query.", cause: "query", requestId: "abc123" },
        },
      },
    );
    render(<CitationReviewTab />);

    expect(await screen.findByText("Could not load this data")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Review portal" })).toHaveAttribute("href", "/review");
    stubQueue({ open: [openSummary] });

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Ready claim")).toBeInTheDocument();
  });
});

type Deferred = { promise: Promise<void>; resolve: () => void };

function defer(): Deferred {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/**
 * A stateful server: status posts change the stored rows, so refreshes return
 * the decided state. Detail requests can be held per slug to reorder replies.
 */
function stubServer(options: {
  queue: CitationReviewQueueSummary[];
  rowsBySlug: Record<string, CitationEvidenceRow[]>;
  posts?: StatusPost[];
  holdDetail?: Record<string, Deferred>;
  holdPost?: Deferred;
}) {
  const store = new Map(
    Object.entries(options.rowsBySlug).map(([slug, slugRows]) => [slug, slugRows.map((row) => ({ ...row }))]),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "https://dose.wiki");
      if (url.pathname === "/api/citation-evidence/queue") {
        return Response.json({ ok: true, queue: options.queue });
      }
      if (url.pathname === "/api/citation-evidence") {
        const slug = url.searchParams.get("slug") ?? "";
        const hold = options.holdDetail?.[slug];
        if (hold) {
          delete options.holdDetail?.[slug];
          await hold.promise;
        }
        return Response.json({ ok: true, rows: store.get(slug) ?? [] });
      }
      if (url.pathname === "/api/citation-evidence/status" && init?.method === "POST") {
        const post = JSON.parse(String(init.body)) as StatusPost;
        options.posts?.push(post);
        if (options.holdPost) {
          const hold = options.holdPost;
          options.holdPost = undefined;
          await hold.promise;
        }
        const wanted = new Set(post.claimKeys);
        store.set(
          post.slug,
          (store.get(post.slug) ?? []).map((row) =>
            wanted.has(row.claimKey)
              ? { ...row, status: post.status as CitationEvidenceRow["status"], statusReason: post.statusReason }
              : row,
          ),
        );
        return Response.json({ ok: true, updated: post.claimKeys.length });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }),
  );
}

const twoReadyRows: CitationEvidenceRow[] = [
  createRow({ claimKey: "summary:first", claimText: "First claim" }),
  createRow({
    claimKey: "summary:second",
    claimText: "Second claim",
    supports: [{ ...verifiedSupport, supportingQuote: "Second quote text" }],
  }),
];

function evidenceRow(claimText: string) {
  return screen.getByRole("group", { name: `Evidence row: ${claimText}` });
}

describe("CitationReviewTab decisions refresh in place", () => {
  it("keeps a sibling row expanded with its typed reason while a decision refreshes", async () => {
    const user = userEvent.setup();
    const posts: StatusPost[] = [];
    const holdPost = defer();
    stubServer({ queue: [openSummary], rowsBySlug: { lsd: twoReadyRows }, posts, holdPost });
    render(<CitationReviewTab />);

    await user.click(await screen.findByRole("button", { name: /Second claim/ }));
    await user.click(within(evidenceRow("Second claim")).getByRole("button", { name: "Reject" }));
    await user.type(screen.getByLabelText("Detail (optional)"), "Half-typed reason");

    await user.click(screen.getByRole("button", { name: /First claim/ }));
    await user.click(within(evidenceRow("First claim")).getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    // While the write is in flight the queue and the rows stay on screen.
    expect(screen.queryByText("Loading review queue")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading evidence detail")).not.toBeInTheDocument();
    holdPost.resolve();

    const undo = await within(evidenceRow("First claim")).findByRole("button", { name: "Undo" });
    expect(undo).toBeInTheDocument();
    expect(screen.queryByText("Loading review queue")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Detail (optional)")).toHaveValue("Half-typed reason");
    expect(within(evidenceRow("First claim")).getByText("Approved")).toBeInTheDocument();
  });

  it("shows only the last clicked article's rows when an earlier request resolves last", async () => {
    const user = userEvent.setup();
    const mdmaSummary = { ...openSummary, slug: "mdma", articleId: 2 };
    const holdLsd = defer();
    stubServer({
      queue: [openSummary, mdmaSummary],
      rowsBySlug: {
        lsd: [createRow({ claimKey: "summary:lsd", claimText: "LSD claim" })],
        mdma: [createRow({ claimKey: "summary:mdma", claimText: "MDMA claim" })],
      },
      holdDetail: { lsd: holdLsd },
    });
    render(<CitationReviewTab />);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/citation-evidence?slug=lsd", undefined));
    await user.click(await screen.findByRole("button", { name: /mdma/i }));
    expect(await screen.findByText("MDMA claim")).toBeInTheDocument();

    holdLsd.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await waitFor(() => expect(screen.getByText("MDMA claim")).toBeInTheDocument());
    expect(screen.queryByText("LSD claim")).not.toBeInTheDocument();
  });

  it("keeps the undo in the affected row until the next decision replaces it", async () => {
    const user = userEvent.setup();
    const posts: StatusPost[] = [];
    stubServer({ queue: [openSummary], rowsBySlug: { lsd: twoReadyRows }, posts });
    render(<CitationReviewTab />);

    await user.click(await screen.findByRole("button", { name: /First claim/ }));
    await user.click(within(evidenceRow("First claim")).getByRole("button", { name: "Approve" }));
    expect(await within(evidenceRow("First claim")).findByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(within(evidenceRow("Second claim")).queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Second claim/ }));
    await user.click(within(evidenceRow("Second claim")).getByRole("button", { name: "Approve" }));
    expect(await within(evidenceRow("Second claim")).findByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(within(evidenceRow("First claim")).queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("unlocks the article-wide approval only after every ready row has been opened", async () => {
    const user = userEvent.setup();
    stubServer({ queue: [openSummary], rowsBySlug: { lsd: twoReadyRows } });
    render(<CitationReviewTab />);

    const approveAll = await screen.findByRole("button", { name: "Approve 2 ready rows" });
    await user.click(screen.getByRole("button", { name: /First claim/ }));
    expect(approveAll).toBeDisabled();
    expect(screen.getByText(/before approving the set \(1 of 2 opened\)/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Second claim/ }));
    expect(approveAll).toBeEnabled();
  });

  it("gates and confirms 'Approve section-ready rows' like the article-wide approval", async () => {
    const user = userEvent.setup();
    const posts: StatusPost[] = [];
    stubServer({ queue: [openSummary], rowsBySlug: { lsd: twoReadyRows }, posts });
    render(<CitationReviewTab />);

    const approveSection = await screen.findByRole("button", { name: "Approve section-ready rows" });
    expect(approveSection).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /First claim/ }));
    await user.click(screen.getByRole("button", { name: /Second claim/ }));
    expect(approveSection).toBeEnabled();

    await user.click(approveSection);
    const dialog = await screen.findByRole("dialog", { name: "Approve 2 ready rows in Summary?" });
    expect(posts).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Approve 2 rows" }));
    await waitFor(() =>
      expect(posts).toEqual([{ slug: "lsd", claimKeys: ["summary:first", "summary:second"], status: "approved" }]),
    );
  });

  it("shows each row's quote while the row is collapsed", async () => {
    stubServer({ queue: [openSummary], rowsBySlug: { lsd: twoReadyRows } });
    render(<CitationReviewTab />);

    const toggle = await screen.findByRole("button", { name: /Second claim/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(evidenceRow("Second claim")).getByText("Second quote text")).toBeInTheDocument();
  });
});

