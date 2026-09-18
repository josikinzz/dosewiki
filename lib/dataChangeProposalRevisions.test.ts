import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { approveAndApplyHandler } from "../server/changeProposalReview";
import { submitHandler } from "../server/changeProposals";
import { projectEditorArticle } from "../src/data/projections/substanceReadProjections";
import { minimalArticle } from "../src/test/fixtures/articles";
import { contentHash } from "./proposals/contentHash";

const SERVER_KEY = "test-admin-key";

type Row = Record<string, unknown> & { _id: string };

/**
 * In-memory tables for the rebase path: `memberships.by_email` for
 * `requireRole`, `substanceIndex.by_slug` for the base hash, and
 * `changeProposals` by id for the revision link.
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
    ctx: { auth: { getUserIdentity: vi.fn(async () => null) }, db } as never,
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
const otherEditor: Row = { ...admin, _id: "m2", email: "other@example.com", role: "editor" };

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

function liveArticleHash(row: Row) {
  const { _id: _rowId, _creationTime: _createdAt, ...content } = projectEditorArticle(row as never) as Record<
    string,
    unknown
  >;
  return contentHash(content);
}

function proposalRow(overrides: Record<string, unknown> = {}): Row {
  return {
    _id: "proposal_p1",
    proposedBy: "editor@example.com",
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    status: "changes_requested",
    targets: [{ kind: "article", key: "lsd", baseHash: "stale" }],
    payload: { articles: [proposedLsd] },
    summary: "Update LSD",
    diff: "# LSD\n\n- Stored summary\n+ Proposed summary",
    comments: [],
    conflictReason: 'article "lsd" changed in production',
    ...overrides,
  };
}

function submitArgs(overrides: Record<string, unknown> = {}) {
  return {
    apiKey: SERVER_KEY,
    actorEmail: "editor@example.com",
    payload: { articles: [{ ...proposedLsd, summary: "Rebased summary" }] },
    summary: "Update LSD (rebased)",
    baselines: [{ kind: "article", key: "lsd", document: projectEditorArticle(storedLsd as never) }],
    revisionOf: "proposal_p1",
    ...overrides,
  } as never;
}

beforeEach(() => {
  process.env.DATA_ADMIN_KEY = SERVER_KEY;
});

afterEach(() => {
  delete process.env.DATA_ADMIN_KEY;
});

describe("changeProposals.submit with revisionOf", () => {
  it("links the new revision to the returned proposal, re-pins the base hash, and supersedes the old row", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [editor],
      substanceIndex: [storedLsd],
      changeProposals: [proposalRow()],
    });

    const result = await submitHandler(ctx, submitArgs());

    expect(result).toEqual({ proposalId: "changeProposals:1" });
    const revision = rowsOf("changeProposals").get("changeProposals:1")!;
    expect(revision).toMatchObject({
      proposedBy: "editor@example.com",
      status: "submitted",
      revisionOf: "proposal_p1",
      summary: "Update LSD (rebased)",
      targets: [{ kind: "article", key: "lsd", baseHash: liveArticleHash(storedLsd) }],
    });
    const superseded = rowsOf("changeProposals").get("proposal_p1")!;
    expect(superseded.status).toBe("superseded");
    expect(superseded.updatedAt).toBe(revision.createdAt);
    // The old row keeps its content: only the status moved.
    expect(superseded.summary).toBe("Update LSD");
  });

  it("lets an admin revise another editor's returned proposal", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin, editor],
      substanceIndex: [storedLsd],
      changeProposals: [proposalRow()],
    });

    await submitHandler(ctx, submitArgs({ actorEmail: "admin@example.com" }));

    expect(rowsOf("changeProposals").get("changeProposals:1")).toMatchObject({
      proposedBy: "admin@example.com",
      revisionOf: "proposal_p1",
    });
    expect(rowsOf("changeProposals").get("proposal_p1")!.status).toBe("superseded");
  });

  it("also supersedes a proposal that is still waiting in the queue", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [editor],
      substanceIndex: [storedLsd],
      changeProposals: [proposalRow({ status: "submitted", conflictReason: undefined })],
    });

    await submitHandler(ctx, submitArgs());

    expect(rowsOf("changeProposals").get("proposal_p1")!.status).toBe("superseded");
  });

  it("refuses another editor's proposal and writes nothing", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [editor, otherEditor],
      substanceIndex: [storedLsd],
      changeProposals: [proposalRow()],
    });

    await expect(submitHandler(ctx, submitArgs({ actorEmail: "other@example.com" }))).rejects.toMatchObject({
      data: { code: "PROPOSAL_NOT_OWNED" },
    });

    expect(rowsOf("changeProposals").size).toBe(1);
    expect(rowsOf("changeProposals").get("proposal_p1")!.status).toBe("changes_requested");
  });

  it.each(["applied", "rejected", "superseded", "reverted"])(
    "refuses to revise a %s proposal",
    async (status) => {
      const { ctx, rowsOf } = createCtx({
        memberships: [editor],
        substanceIndex: [storedLsd],
        changeProposals: [proposalRow({ status })],
      });

      await expect(submitHandler(ctx, submitArgs())).rejects.toMatchObject({
        data: { code: "PROPOSAL_STATUS_INVALID" },
      });

      expect(rowsOf("changeProposals").size).toBe(1);
      expect(rowsOf("changeProposals").get("proposal_p1")!.status).toBe(status);
    },
  );

  it("refuses a revision that shares no target with the proposal it would supersede", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [editor],
      substanceIndex: [storedLsd],
      changeProposals: [proposalRow()],
    });

    await expect(
      submitHandler(ctx, submitArgs({
        payload: { indexLayouts: [{ type: "chemical", version: 1, categories: [] }] },
        summary: "Unrelated layout",
        baselines: [{ kind: "indexLayout", key: "chemical", document: null }],
      })),
    ).rejects.toMatchObject({ data: { code: "PROPOSAL_REVISION_MISMATCH" } });

    expect(rowsOf("changeProposals").size).toBe(1);
    expect(rowsOf("changeProposals").get("proposal_p1")!.status).toBe("changes_requested");

    // Overlap on any one target is enough: the layout rides along with the article.
    await submitHandler(ctx, submitArgs({
      payload: {
        articles: [{ ...proposedLsd, summary: "Rebased summary" }],
        indexLayouts: [{ type: "chemical", version: 1, categories: [] }],
      },
      baselines: [
        { kind: "article", key: "lsd", document: projectEditorArticle(storedLsd as never) },
        { kind: "indexLayout", key: "chemical", document: null },
      ],
    }));
    expect(rowsOf("changeProposals").get("proposal_p1")!.status).toBe("superseded");
  });

  it("refuses a revision of a proposal that no longer exists", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor], substanceIndex: [storedLsd] });

    await expect(submitHandler(ctx, submitArgs({ revisionOf: "changeProposals:missing" }))).rejects.toMatchObject({
      data: { code: "PROPOSAL_NOT_FOUND" },
    });
    expect(rowsOf("changeProposals").size).toBe(0);
  });

  it("stores no revision link when revisionOf is absent", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor], substanceIndex: [storedLsd] });

    await submitHandler(ctx, submitArgs({ revisionOf: undefined }));

    expect(rowsOf("changeProposals").get("changeProposals:1")).not.toHaveProperty("revisionOf");
  });
});

describe("changeProposalReview.approveAndApply on a superseded proposal", () => {
  it("refuses with PROPOSAL_STATUS_INVALID and leaves production alone", async () => {
    const { ctx, db, rowsOf } = createCtx({
      memberships: [admin],
      substanceIndex: [storedLsd],
      changeProposals: [
        proposalRow({
          status: "superseded",
          conflictReason: undefined,
          targets: [{ kind: "article", key: "lsd", baseHash: liveArticleHash(storedLsd) }],
        }),
      ],
    });

    await expect(
      approveAndApplyHandler(ctx, {
        apiKey: SERVER_KEY,
        actorEmail: "admin@example.com",
        proposalId: "proposal_p1" as never,
      }),
    ).rejects.toMatchObject({ data: { code: "PROPOSAL_STATUS_INVALID" } });

    expect(rowsOf("substanceIndex").get("s1")!.summary).toBe("Stored summary");
    expect(db.patch).not.toHaveBeenCalled();
    expect(db.replace).not.toHaveBeenCalled();
  });
});
