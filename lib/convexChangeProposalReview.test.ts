import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MutationCtx } from "../convex/_generated/server";
import { approveAndApplyHandler, rejectHandler, revertHandler } from "../convex/changeProposalReview";
import { projectEditorArticle } from "../convex/lib/substanceReadProjections";
import { minimalArticle } from "../src/test/fixtures/articles";
import { contentHash } from "./proposals/contentHash";

const SERVER_KEY = "test-admin-key";

type Row = Record<string, unknown> & { _id: string };

/**
 * In-memory tables covering everything the review handlers and the write
 * handlers they delegate to touch: `withIndex(...).eq(field, value)` lookups,
 * the index-free `query("categoryLayout").first()` the layout mirror uses,
 * `get`, `insert`, `patch`, `replace`, and `delete`.
 */
function createCtx(seed: Record<string, Row[]>) {
  const tables = new Map<string, Map<string, Row>>();
  for (const [table, rows] of Object.entries(seed)) {
    tables.set(table, new Map(rows.map((row) => [row._id, structuredClone(row)])));
  }
  let nextId = 1;
  const rowsOf = (table: string) => {
    if (!tables.has(table)) {
      tables.set(table, new Map());
    }
    return tables.get(table)!;
  };
  const rowById = (id: string) => {
    for (const rows of tables.values()) {
      const row = rows.get(id);
      if (row) return { rows, row };
    }
    return null;
  };

  const results = (matches: Row[]) => ({
    order: () => results(matches),
    take: async (count: number) => matches.slice(0, count),
    first: async () => matches[0] ?? null,
    unique: async () => matches[0] ?? null,
    collect: async () => matches,
  });
  const query = (table: string) => ({
    ...results([...rowsOf(table).values()]),
    withIndex: (
      _indexName: string,
      selector?: (query: { eq: (field: string, value: unknown) => unknown }) => unknown,
    ) => {
      let field = "";
      let value: unknown;
      selector?.({
        eq: (name, candidate) => {
          field = name;
          value = candidate;
          return {};
        },
      });
      return results([...rowsOf(table).values()].filter((row) => field === "" || row[field] === value));
    },
  });

  const db = {
    query: vi.fn(query),
    get: vi.fn(async (id: string) => rowById(id)?.row ?? null),
    insert: vi.fn(async (table: string, doc: Record<string, unknown>) => {
      const _id = `${table}:${nextId++}`;
      rowsOf(table).set(_id, { _id, ...doc });
      return _id;
    }),
    patch: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const hit = rowById(id);
      if (hit) hit.rows.set(id, { ...hit.row, ...patch });
    }),
    replace: vi.fn(async (id: string, doc: Record<string, unknown>) => {
      const hit = rowById(id);
      if (hit) hit.rows.set(id, { _id: id, ...doc });
    }),
    delete: vi.fn(async (id: string) => {
      rowById(id)?.rows.delete(id);
    }),
  };

  return {
    ctx: { auth: { getUserIdentity: vi.fn(async () => null) }, db } as unknown as MutationCtx,
    db,
    rowsOf,
  };
}

const admin: Row = {
  _id: "m0",
  email: "admin@example.com",
  role: "admin",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const editor: Row = { ...admin, _id: "m1", email: "editor@example.com", role: "editor" };

const storedLsd: Row = {
  _id: "s1",
  _creationTime: 1700000000000,
  ...structuredClone(minimalArticle),
  id: 1,
  title: "LSD",
  slug: "lsd",
  summary: "Stored summary",
};

const proposedLsd = {
  ...structuredClone(minimalArticle),
  id: 1,
  title: "LSD",
  slug: "lsd",
  summary: "Proposed summary",
};

const proposedLayout = {
  type: "psychoactive" as const,
  version: 2,
  categories: [
    {
      key: "psychedelics",
      label: "Psychedelics",
      iconKey: "psychedelics",
      sections: [{ key: "classic", label: "Classic", drugs: ["lsd"] }],
      drugs: [],
    },
  ],
};

/** What `readProposalTarget` returns for the stored article: the editor projection without system fields. */
function liveArticleDocument(row: Row) {
  const { _id: _rowId, _creationTime: _createdAt, ...content } = projectEditorArticle(row as never) as Record<
    string,
    unknown
  >;
  return content;
}

function proposalRow(overrides: Record<string, unknown> = {}): Row {
  return {
    _id: "changeProposals:p1",
    proposedBy: "editor@example.com",
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    status: "submitted",
    targets: [{ kind: "article", key: "lsd", baseHash: contentHash(liveArticleDocument(storedLsd)) }],
    payload: { articles: [proposedLsd] },
    summary: "Update LSD",
    diff: "# LSD\n\n- Stored summary\n+ Proposed summary",
    comments: [],
    ...overrides,
  };
}

const asAdmin = { apiKey: SERVER_KEY, actorEmail: "admin@example.com", proposalId: "changeProposals:p1" as never };
const asEditor = { ...asAdmin, actorEmail: "editor@example.com" };

beforeEach(() => {
  process.env.CONVEX_ADMIN_KEY = SERVER_KEY;
});

afterEach(() => {
  delete process.env.CONVEX_ADMIN_KEY;
});

describe("changeProposalReview.approveAndApply", () => {
  it("applies the payload through the article write path and records the snapshot, hashes, and changelog", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin, editor],
      substanceIndex: [storedLsd],
      changeProposals: [proposalRow()],
    });

    const result = await approveAndApplyHandler(ctx, asAdmin);

    expect(result).toEqual({ status: "applied", revalidatePaths: ["/lsd", "/substances"] });
    expect(rowsOf("substanceIndex").get("s1")).toMatchObject({ summary: "Proposed summary", slug: "lsd" });

    const proposal = rowsOf("changeProposals").get("changeProposals:p1")!;
    expect(proposal).toMatchObject({
      status: "applied",
      appliedChangelogEntryId: "proposal-changeProposals:p1",
      reviewedBy: "admin@example.com",
      snapshotBefore: [{ kind: "article", key: "lsd", document: liveArticleDocument(storedLsd) }],
    });
    expect(proposal.appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const appliedHashes = proposal.appliedHashes as Array<{ kind: string; key: string; hash: string }>;
    expect(appliedHashes).toEqual([
      { kind: "article", key: "lsd", hash: contentHash(liveArticleDocument(rowsOf("substanceIndex").get("s1")!)) },
    ]);
    expect(appliedHashes[0].hash).not.toBe(contentHash(liveArticleDocument(storedLsd)));

    const [entry] = [...rowsOf("changelog").values()];
    expect(entry).toMatchObject({
      entryId: "proposal-changeProposals:p1",
      message: "Update LSD (proposed by editor@example.com, approved by admin@example.com)",
      markdown: "# LSD\n\n- Stored summary\n+ Proposed summary",
      submittedBy: "EDITOR",
      articles: [],
    });
  });

  it("applies an index layout through the layout write path, including the categoryLayout mirror", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin],
      changeProposals: [
        proposalRow({
          targets: [{ kind: "indexLayout", key: "psychoactive", baseHash: contentHash(null) }],
          payload: {
            indexLayouts: [proposedLayout],
            changelog: { markdown: "layout diff", articles: [{ id: 1, title: "LSD", slug: "lsd" }] },
          },
        }),
      ],
    });

    const result = await approveAndApplyHandler(ctx, asAdmin);

    expect(result).toEqual({ status: "applied", revalidatePaths: ["/substances"] });
    expect([...rowsOf("indexLayouts").values()]).toMatchObject([proposedLayout]);
    expect([...rowsOf("categoryLayout").values()]).toMatchObject([
      { version: 2, categories: [{ key: "psychedelics", sections: [{ key: "classic", drugs: ["lsd"] }] }] },
    ]);
    expect(rowsOf("changeProposals").get("changeProposals:p1")).toMatchObject({
      status: "applied",
      snapshotBefore: [{ kind: "indexLayout", key: "psychoactive", document: null }],
    });
    expect([...rowsOf("changelog").values()][0]).toMatchObject({
      markdown: "layout diff",
      articles: [{ id: 1, title: "LSD", slug: "lsd" }],
    });
  });

  it("flips a drifted proposal to changes_requested and writes nothing to production", async () => {
    const drifted = { ...storedLsd, summary: "Someone else edited this" };
    const { ctx, db, rowsOf } = createCtx({
      memberships: [admin],
      substanceIndex: [drifted],
      changeProposals: [proposalRow()],
    });

    const result = await approveAndApplyHandler(ctx, asAdmin);

    expect(result).toEqual({
      status: "changes_requested",
      conflictReason: 'Production changed since this proposal was drafted: article "lsd". Rebase and resubmit.',
    });
    expect(rowsOf("substanceIndex").get("s1")).toEqual(drifted);
    expect(rowsOf("changelog").size).toBe(0);
    expect(db.patch).toHaveBeenCalledTimes(1);
    expect(db.patch).toHaveBeenCalledWith("changeProposals:p1", expect.objectContaining({ status: "changes_requested" }));
    expect(db.insert).not.toHaveBeenCalled();
    expect(rowsOf("changeProposals").get("changeProposals:p1")).toMatchObject({
      status: "changes_requested",
      reviewedBy: "admin@example.com",
      conflictReason: expect.stringContaining('article "lsd"'),
    });
  });

  it("refuses a proposal that is not open for approval", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin],
      substanceIndex: [storedLsd],
      changeProposals: [proposalRow({ status: "rejected" })],
    });

    await expect(approveAndApplyHandler(ctx, asAdmin)).rejects.toMatchObject({
      data: { code: "PROPOSAL_STATUS_INVALID" },
    });
    expect(rowsOf("substanceIndex").get("s1")).toMatchObject({ summary: "Stored summary" });
  });

  it("refuses an unknown proposal", async () => {
    const { ctx } = createCtx({ memberships: [admin] });

    await expect(approveAndApplyHandler(ctx, asAdmin)).rejects.toMatchObject({
      data: { code: "PROPOSAL_NOT_FOUND" },
    });
  });
});

describe("changeProposalReview.reject", () => {
  it("requires a note", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin], changeProposals: [proposalRow()] });

    await expect(rejectHandler(ctx, { ...asAdmin, note: "   " })).rejects.toMatchObject({
      data: { code: "PROPOSAL_NOTE_REQUIRED" },
    });
    expect(rowsOf("changeProposals").get("changeProposals:p1")).toMatchObject({ status: "submitted" });
  });

  it("marks the proposal rejected with the note and reviewer", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin],
      changeProposals: [proposalRow({ status: "changes_requested" })],
    });

    await expect(rejectHandler(ctx, { ...asAdmin, note: " Duplicate of an earlier fix. " })).resolves.toEqual({
      status: "rejected",
    });
    const proposal = rowsOf("changeProposals").get("changeProposals:p1")!;
    expect(proposal).toMatchObject({
      status: "rejected",
      reviewNotes: "Duplicate of an earlier fix.",
      reviewedBy: "admin@example.com",
    });
    expect(proposal.reviewedAt).toBe(proposal.updatedAt);
  });

  it("refuses to reject an applied proposal", async () => {
    const { ctx } = createCtx({ memberships: [admin], changeProposals: [proposalRow({ status: "applied" })] });

    await expect(rejectHandler(ctx, { ...asAdmin, note: "no" })).rejects.toMatchObject({
      data: { code: "PROPOSAL_STATUS_INVALID" },
    });
  });
});

describe("changeProposalReview.revert", () => {
  it("refuses a proposal that was never applied", async () => {
    const { ctx } = createCtx({ memberships: [admin], substanceIndex: [storedLsd], changeProposals: [proposalRow()] });

    await expect(revertHandler(ctx, asAdmin)).rejects.toMatchObject({ data: { code: "PROPOSAL_STATUS_INVALID" } });
  });

  it("refuses when production moved past the applied state and writes nothing", async () => {
    const appliedRow = { ...storedLsd, summary: "Proposed summary" };
    const { ctx, db, rowsOf } = createCtx({
      memberships: [admin],
      substanceIndex: [{ ...appliedRow, summary: "Edited again after apply" }],
      changeProposals: [
        proposalRow({
          status: "applied",
          snapshotBefore: [{ kind: "article", key: "lsd", document: liveArticleDocument(storedLsd) }],
          appliedHashes: [{ kind: "article", key: "lsd", hash: contentHash(liveArticleDocument(appliedRow)) }],
        }),
      ],
    });

    await expect(revertHandler(ctx, asAdmin)).rejects.toMatchObject({ data: { code: "REVERT_CONFLICT" } });
    expect(rowsOf("substanceIndex").get("s1")).toMatchObject({ summary: "Edited again after apply" });
    expect(rowsOf("changeProposals").get("changeProposals:p1")).toMatchObject({ status: "applied" });
    expect(rowsOf("changelog").size).toBe(0);
    expect(db.patch).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("writes the snapshot back after an apply and marks the proposal reverted", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin, editor],
      substanceIndex: [storedLsd],
      changeProposals: [proposalRow()],
    });
    await approveAndApplyHandler(ctx, asAdmin);
    expect(rowsOf("substanceIndex").get("s1")).toMatchObject({ summary: "Proposed summary" });

    const result = await revertHandler(ctx, asAdmin);

    expect(result).toEqual({ status: "reverted", revalidatePaths: ["/lsd", "/substances"] });
    expect(rowsOf("substanceIndex").get("s1")).toMatchObject({ summary: "Stored summary", slug: "lsd", title: "LSD" });
    const proposal = rowsOf("changeProposals").get("changeProposals:p1")!;
    expect(proposal).toMatchObject({ status: "reverted" });
    expect(proposal.revertedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const entries = [...rowsOf("changelog").values()];
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      entryId: "revert-changeProposals:p1",
      message: "Reverted proposal changeProposals:p1",
      submittedBy: "ADMIN",
    });
  });

  it("removes a row the proposal created when the snapshot recorded absence", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin],
      changeProposals: [
        proposalRow({
          targets: [{ kind: "article", key: "lsd", baseHash: contentHash(null) }],
        }),
      ],
    });
    await approveAndApplyHandler(ctx, asAdmin);
    expect(rowsOf("substanceIndex").size).toBe(1);

    await revertHandler(ctx, asAdmin);

    expect(rowsOf("substanceIndex").size).toBe(0);
    expect(rowsOf("changeProposals").get("changeProposals:p1")).toMatchObject({ status: "reverted" });
  });
});

describe("changeProposalReview admin floor", () => {
  it("refuses an editor at approve, reject, and revert without touching anything", async () => {
    const { ctx, db, rowsOf } = createCtx({
      memberships: [admin, editor],
      substanceIndex: [storedLsd],
      changeProposals: [proposalRow()],
    });

    await expect(approveAndApplyHandler(ctx, asEditor)).rejects.toThrow("Admin access required");
    await expect(rejectHandler(ctx, { ...asEditor, note: "no" })).rejects.toThrow("Admin access required");
    await expect(revertHandler(ctx, asEditor)).rejects.toThrow("Admin access required");
    expect(db.patch).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(rowsOf("changeProposals").get("changeProposals:p1")).toMatchObject({ status: "submitted" });
  });
});
