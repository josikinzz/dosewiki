import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  commentHandler,
  countHandler,
  getHandler,
  listHandler,
  listMineHandler,
  submitHandler,
} from "../server/changeProposals";
import { deriveProposalTargets } from "../server/lib/changeProposalTargets";
import { projectEditorArticle } from "../src/data/projections/substanceReadProjections";
import { minimalArticle } from "../src/test/fixtures/articles";
import { contentHash } from "./proposals/contentHash";
import { get as articleLifecycleGet } from "../server/articleLifecycle";

const SERVER_KEY = "test-admin-key";

type Row = Record<string, unknown> & { _id: string };
type IndexFilter = { eq: (field: string, value: unknown) => IndexFilter };

/**
 * In-memory tables with the `withIndex(...).eq(field, value)` shape every
 * handler under test uses: `memberships.by_email` for `requireRole`,
 * `substanceIndex.by_slug` and `by_article_id`, `indexLayouts.by_type`, and
 * the `changeProposals` indexes, plus the bare `query(table).order(...)` walk
 * the queue list takes.
 */
function createCtx(seed: Record<string, Row[]>) {
  const tables = new Map<string, Map<string, Row>>();
  for (const [table, rows] of Object.entries(seed)) {
    tables.set(table, new Map(rows.map((row) => [row._id, { ...row }])));
  }
  let nextId = 1;
  const rowsOf = (table: string) => {
    if (!tables.has(table)) {
      tables.set(table, new Map());
    }
    return tables.get(table)!;
  };

  const scan = (rows: Row[]) => {
    let matches = rows;
    const api = {
      order: (direction: "asc" | "desc") => {
        if (direction === "desc") {
          matches = [...matches].reverse();
        }
        return api;
      },
      take: async (count: number) => matches.slice(0, count),
      first: async () => matches[0] ?? null,
      unique: async () => {
        if (matches.length > 1) {
          throw new Error(`index returned ${matches.length} rows`);
        }
        return matches[0] ?? null;
      },
      collect: async () => matches,
    };
    return api;
  };

  const query = (table: string) => ({
    ...scan([...rowsOf(table).values()]),
    withIndex: (
      _indexName: string,
      selector: (query: IndexFilter) => unknown,
    ) => {
      const conditions: Array<[string, unknown]> = [];
      const indexQuery: IndexFilter = {
        eq: (field: string, value: unknown) => {
          conditions.push([field, value]);
          return indexQuery;
        },
      };
      selector(indexQuery);
      return scan([...rowsOf(table).values()].filter((row) => conditions.every(([field, value]) => row[field] === value)));
    },
  });

  return {
    ctx: {
      auth: { getUserIdentity: vi.fn(async () => null) },
      db: {
        query: vi.fn(query),
        get: vi.fn(async (id: string) => {
          for (const rows of tables.values()) {
            const existing = rows.get(id);
            if (existing) {
              return existing;
            }
          }
          return null;
        }),
        insert: vi.fn(async (table: string, doc: Record<string, unknown>) => {
          const _id = `${table}:${nextId++}`;
          rowsOf(table).set(_id, { _id, _creationTime: nextId, ...doc });
          return _id;
        }),
        patch: vi.fn(async (id: string, patch: Record<string, unknown>) => {
          for (const rows of tables.values()) {
            const existing = rows.get(id);
            if (existing) {
              rows.set(id, { ...existing, ...patch });
            }
          }
        }),
      },
    } as never,
    rowsOf,
  };
}

const editor = {
  _id: "m1",
  email: "editor@example.com",
  role: "editor",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} satisfies Row;

const contributor: Row = { ...editor, _id: "m2", email: "contributor@example.com", role: "contributor" };

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

function submitArgs(overrides: Record<string, unknown> = {}) {
  return {
    apiKey: SERVER_KEY,
    actorEmail: "editor@example.com",
    payload: { articles: [proposedLsd] },
    summary: "Update LSD",
    baselines: [{ kind: "article", key: "lsd", document: projectEditorArticle(storedLsd as never) }],
    ...overrides,
  };
}

describe("changeProposals.submit", () => {
  beforeEach(() => {
    process.env.DATA_ADMIN_KEY = SERVER_KEY;
  });

  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
  });

  it("stores an editor's proposal as submitted with the base hash of the production row", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor], substanceIndex: [storedLsd] });

    const result = await submitHandler(ctx, submitArgs() as never);

    expect(result).toEqual({ proposalId: "changeProposals:1" });
    const stored = rowsOf("changeProposals").get("changeProposals:1")!;
    const { _id: _rowId, _creationTime: _createdAt, ...storedContent } = projectEditorArticle(storedLsd as never) as Record<string, unknown>;
    expect(stored).toMatchObject({
      proposedBy: "editor@example.com",
      status: "submitted",
      summary: "Update LSD",
      comments: [],
      targets: [{ kind: "article", key: "lsd", baseHash: contentHash(storedContent) }],
      payload: { articles: [proposedLsd] },
    });
    expect(stored.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(stored.updatedAt).toBe(stored.createdAt);
    expect(stored.targets[0].baseHash).not.toBe(contentHash(proposedLsd));
  });

  it("submits one country addition without rewriting legacy sections and keeps it discoverable to its author", async () => {
    const source = {
      ...storedLsd,
      _creationTime: 0,
      dosage: { routes: [{ route: "Legacy route", dose_ranges: {}, notes: "Untouched route detail" }] },
      references: [{ id: "fixture-law", title: "Fixture legal source", sourceType: "government_or_regulatory" }],
      legality: {
        countries: { Canada: { status: "Stored status", notes: "Untouched notes", legacyDetail: "Keep this field" } },
      },
    };
    const { _id, _creationTime, ...before } = source;
    const proposed = {
      ...before,
      legality: { ...before.legality, countries: {
        ...before.legality.countries,
        Australia: { status: "Restricted", notes: "Fixture only [cite:fixture-law]", canonicalStatus: "restricted_other", instrument: "Fixture instrument" },
      } },
    };
    const otherEditor = { ...editor, _id: "m-other", email: "other@example.com" };
    const { ctx } = createCtx({ memberships: [editor, otherEditor], substanceIndex: [source] });
    const { proposalId } = await submitHandler(ctx, submitArgs({
      payload: { articles: [proposed] },
      baselines: [{ kind: "article", key: "lsd", document: projectEditorArticle(source as never) }],
    }) as never);
    const detail = await getHandler(ctx, { apiKey: SERVER_KEY, actorEmail: editor.email, id: proposalId });
    expect(detail).toMatchObject({ payload: { articles: [{
      dosage: before.dosage, legality: { countries: { Canada: before.legality.countries.Canada } },
    }] } });
    expect(detail!.diff).toContain("legality.countries.Australia");
    expect(detail!.diff).not.toMatch(/dosage|pharmacology|Canada|^-./m);
    // Postgres exposes the registered handler at runtime for local handler fixtures.
    const registered = articleLifecycleGet as unknown as {
      _handler: (ctx: never, args: unknown) => Promise<{ proposals: Array<{ _id: string }> }>;
    };
    const own = await registered._handler(ctx, { apiKey: SERVER_KEY, actorEmail: editor.email, slug: "lsd" });
    expect(own.proposals.map((proposal) => proposal._id)).toContain(proposalId);
    const other = await registered._handler(ctx, { apiKey: SERVER_KEY, actorEmail: otherEditor.email, slug: "lsd" });
    expect(other.proposals).toEqual([]);
    expect(await getHandler(ctx, { apiKey: SERVER_KEY, actorEmail: otherEditor.email, id: proposalId })).toBeNull();
  });

  it("rejects a draft loaded before a production edit and leaves existing proposals untouched", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor], substanceIndex: [{ ...storedLsd, summary: "New production" }] });
    await expect(submitHandler(ctx, submitArgs() as never))
      .rejects.toMatchObject({ data: { code: "PROPOSAL_BASELINE_STALE", message: expect.stringContaining("draft is preserved") } });
    expect(rowsOf("changeProposals").size).toBe(0);
  });

  it("derives review changes from the payload even when caller and stored diffs lie", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor], substanceIndex: [storedLsd] });
    const { proposalId } = await submitHandler(ctx, submitArgs({ diff: "Nothing changed" }) as never);
    const stored = rowsOf("changeProposals").get(proposalId)!;
    expect(stored.diff).toContain("Proposed summary");
    expect(stored.diff).toContain("Stored summary");
    rowsOf("changeProposals").set(proposalId, { ...stored, diffVersion: undefined, diff: "Nothing changed" });
    const detail = await getHandler(ctx, { apiKey: SERVER_KEY, actorEmail: editor.email, id: proposalId });
    expect(detail!.diff).toContain("Proposed summary");
    expect(detail!.diff).not.toContain("Nothing changed");
  });

  it("preserves the server-generated submitted comparison after rejection and production drift", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor], substanceIndex: [storedLsd] });
    const { proposalId } = await submitHandler(ctx, submitArgs() as never);
    const stored = rowsOf("changeProposals").get(proposalId)!;
    rowsOf("changeProposals").set(proposalId, { ...stored, status: "rejected" });
    rowsOf("substanceIndex").set("s1", { ...storedLsd, summary: "Later production" });
    const detail = await getHandler(ctx, { apiKey: SERVER_KEY, actorEmail: editor.email, id: proposalId });
    expect(detail!.comparisonMode).toBe("submitted");
    expect(detail!.diff).toContain("Stored summary");
    expect(detail!.diff).toContain("Proposed summary");
    expect(detail!.diff).not.toContain("Later production");
  });

  it("does not present unverifiable legacy client text as a historical comparison", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor], substanceIndex: [storedLsd] });
    const { proposalId } = await submitHandler(ctx, submitArgs() as never);
    const stored = rowsOf("changeProposals").get(proposalId)!;
    rowsOf("changeProposals").set(proposalId, { ...stored, diffVersion: undefined, diff: "Untrusted legacy text" });
    rowsOf("substanceIndex").set("s1", { ...storedLsd, summary: "Later production" });
    const detail = await getHandler(ctx, { apiKey: SERVER_KEY, actorEmail: editor.email, id: proposalId });
    expect(detail).toMatchObject({ comparisonMode: "unavailable", diff: "" });
    expect(detail!.comparisonNote).toContain("no verified server-generated diff");
  });

  it("uses the captured apply snapshot for historical rows without diff provenance", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor], substanceIndex: [storedLsd] });
    const { proposalId } = await submitHandler(ctx, submitArgs() as never);
    const stored = rowsOf("changeProposals").get(proposalId)!;
    rowsOf("changeProposals").set(proposalId, {
      ...stored, status: "reverted", diffVersion: undefined, diff: "Untrusted legacy text",
      snapshotBefore: [{ kind: "article", key: "lsd", document: projectEditorArticle(storedLsd as never) }],
    });
    rowsOf("substanceIndex").set("s1", { ...storedLsd, summary: "Later production" });
    const detail = await getHandler(ctx, { apiKey: SERVER_KEY, actorEmail: editor.email, id: proposalId });
    expect(detail!.comparisonMode).toBe("applied");
    expect(detail!.diff).toContain("Stored summary");
    expect(detail!.diff).not.toContain("Later production");
  });

  it("hashes a missing production row as null so a new article proposal records absence", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor] });

    await submitHandler(ctx, submitArgs({
      payload: { articles: [{ ...proposedLsd, id: null, title: "New Thing", slug: "new-thing" }] },
      baselines: [{ kind: "article", key: "new-thing", document: null }],
    }) as never);

    expect(rowsOf("changeProposals").get("changeProposals:1")!.targets).toEqual([
      { kind: "article", key: "new-thing", baseHash: contentHash(null) },
    ]);
  });

  it("keys an article by the slug of the row its id names and refuses a proposal that moves it", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor], substanceIndex: [storedLsd] });

    // The payload slug is the id-row's current slug: pinned there, whatever the title says.
    await submitHandler(ctx, submitArgs({ payload: { articles: [{ ...proposedLsd, title: "Lysergide" }] } }) as never);
    const { _id: _rowId, _creationTime: _createdAt, ...storedContent } = projectEditorArticle(storedLsd as never) as Record<string, unknown>;
    expect(rowsOf("changeProposals").get("changeProposals:1")!.targets).toEqual([
      { kind: "article", key: "lsd", baseHash: contentHash(storedContent) },
    ]);

    // A renamed slug on an existing id would pin the new slug (absent, hash of
    // null) while the apply patched the id-row: refused before anything is stored.
    await expect(
      submitHandler(ctx, submitArgs({ payload: { articles: [{ ...proposedLsd, slug: "lysergide" }] } }) as never),
    ).rejects.toMatchObject({ data: { code: "PROPOSAL_SLUG_MOVE" } });
    await expect(
      submitHandler(ctx, submitArgs({
        payload: { articles: [{ ...proposedLsd, slug: undefined, title: "Lysergic acid diethylamide" }] },
      }) as never),
    ).rejects.toMatchObject({ data: { code: "PROPOSAL_SLUG_MOVE" } });
    expect(rowsOf("changeProposals").size).toBe(1);
  });

  it("hashes an index layout target from the stored layout without system fields", async () => {
    const layout = {
      _id: "l1",
      _creationTime: 1,
      type: "chemical",
      version: 3,
      categories: [{ key: "phen", label: "Phenethylamines", iconKey: "x", drugs: ["mdma"], sections: [] }],
    };
    const { ctx, rowsOf } = createCtx({ memberships: [editor], indexLayouts: [layout] });

    await submitHandler(ctx, submitArgs({
      payload: { indexLayouts: [{ type: "chemical", version: 4, categories: [] }] },
      baselines: [{ kind: "indexLayout", key: "chemical", document: layout }],
    }) as never);

    const { _id: _rowId, _creationTime: _createdAt, ...content } = layout;
    expect(rowsOf("changeProposals").get("changeProposals:1")!.targets).toEqual([
      { kind: "indexLayout", key: "chemical", baseHash: contentHash(content) },
    ]);
  });

  it("refuses a contributor", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [contributor], substanceIndex: [storedLsd] });

    await expect(
      submitHandler(ctx, submitArgs({ actorEmail: "contributor@example.com" }) as never),
    ).rejects.toThrow("Editor access required");
    expect(rowsOf("changeProposals").size).toBe(0);
  });

  it("rejects an article that fails the ingestion contract before storing anything", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor], substanceIndex: [storedLsd] });
    const invalid = {
      ...proposedLsd,
      pharmacology: { ...proposedLsd.pharmacology, binding_sites: [{ target: "5-HT2A", tag: 42 }] },
    };

    await expect(
      submitHandler(ctx, submitArgs({ payload: { articles: [invalid] } }) as never),
    ).rejects.toThrow(/binding_sites/);
    expect(rowsOf("changeProposals").size).toBe(0);
  });

  it("rejects an empty payload, a payload that writes one row twice, and a blank summary", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor], substanceIndex: [storedLsd] });

    await expect(
      submitHandler(ctx, submitArgs({ payload: {} }) as never),
    ).rejects.toMatchObject({ data: { code: "PROPOSAL_EMPTY" } });
    await expect(
      submitHandler(ctx, submitArgs({
        payload: { articles: [proposedLsd, proposedLsd] },
      }) as never),
    ).rejects.toMatchObject({ data: { code: "PROPOSAL_TARGET_DUPLICATE" } });
    await expect(
      submitHandler(ctx, submitArgs({ summary: "   " }) as never),
    ).rejects.toThrow(/Summary must be/);
    expect(rowsOf("changeProposals").size).toBe(0);
  });
});

describe("changeProposals reads", () => {
  beforeEach(() => {
    process.env.DATA_ADMIN_KEY = SERVER_KEY;
  });

  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
  });

  it("lists only the actor's proposals, newest first, without payload or diff", async () => {
    const { ctx } = createCtx({ memberships: [editor], substanceIndex: [storedLsd] });
    await submitHandler(ctx, submitArgs({ summary: "First" }) as never);
    await submitHandler(ctx, submitArgs({ summary: "Second" }) as never);
    await submitHandler(ctx, submitArgs({ actorEmail: undefined, summary: "Script" }) as never);

    const mine = await listMineHandler(ctx, { apiKey: SERVER_KEY, actorEmail: "editor@example.com" });

    expect(mine.map((row) => row.summary)).toEqual(["Second", "First"]);
    expect(mine[0]).toMatchObject({ status: "submitted", commentCount: 0, proposerName: "Contributor", isAuthor: true });
    expect(mine[0]).not.toHaveProperty("proposedBy");
    expect(mine[0]).not.toHaveProperty("payload");
    expect(mine[0]).not.toHaveProperty("diff");
  });

  it("counts submitted proposals for editors and refuses contributors", async () => {
    const { ctx } = createCtx({ memberships: [editor, contributor], substanceIndex: [storedLsd] });
    await submitHandler(ctx, submitArgs() as never);
    await submitHandler(ctx, submitArgs({ actorEmail: undefined }) as never);
    await expect(countHandler(ctx, { apiKey: SERVER_KEY })).resolves.toEqual({ submitted: 2 });

    await expect(countHandler(ctx, { apiKey: SERVER_KEY, actorEmail: "editor@example.com" })).resolves.toEqual({
      submitted: 1,
    });
    await expect(
      countHandler(ctx, { apiKey: SERVER_KEY, actorEmail: "contributor@example.com" }),
    ).rejects.toThrow("Editor access required");
  });

  it("does not bury pending work behind the bounded history window", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor], substanceIndex: [storedLsd] });
    const { proposalId } = await submitHandler(ctx, submitArgs() as never);
    const pending = rowsOf("changeProposals").get(proposalId)!;
    for (let index = 0; index < 205; index += 1) {
      rowsOf("changeProposals").set(`history:${index}`, {
        ...pending, _id: `history:${index}`, _creationTime: index + 100, status: "applied",
      });
    }
    for (const actorEmail of [editor.email, undefined]) {
      const listed = await listHandler(ctx, { apiKey: SERVER_KEY, actorEmail });
      expect(listed.some((row) => row._id === proposalId)).toBe(true);
      expect(listed).toHaveLength(201);
      const history = await listHandler(ctx, { apiKey: SERVER_KEY, actorEmail, status: "applied" });
      expect(history).toHaveLength(200);
      expect(history.every((row) => row.status === "applied")).toBe(true);
    }
  });

  it("lists the whole queue newest first, filtered by status, without payload or diff", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor, contributor], substanceIndex: [storedLsd] });
    await submitHandler(ctx, submitArgs({ summary: "First" }) as never);
    const { proposalId: scriptProposalId } = await submitHandler(ctx, submitArgs({ actorEmail: undefined, summary: "Script" }) as never);
    await submitHandler(ctx, submitArgs({ summary: "Third" }) as never);
    rowsOf("changeProposals").set(scriptProposalId, {
      ...rowsOf("changeProposals").get(scriptProposalId)!,
      status: "rejected",
    });

    const all = await listHandler(ctx, { apiKey: SERVER_KEY, actorEmail: "editor@example.com" });
    expect(all.map((row) => row.summary)).toEqual(["Third", "First"]);
    const global = await listHandler(ctx, { apiKey: SERVER_KEY });
    expect(global.map((row) => row.summary)).toEqual(["Third", "Script", "First"]);
    expect(all[0]).not.toHaveProperty("payload");
    expect(all[0]).not.toHaveProperty("diff");
    expect(all[0]).not.toHaveProperty("snapshotBefore");

    const rejected = await listHandler(ctx, {
      apiKey: SERVER_KEY,
      actorEmail: "editor@example.com",
      status: "rejected",
    });
    expect(rejected).toEqual([]);

    await expect(
      listHandler(ctx, { apiKey: SERVER_KEY, actorEmail: "contributor@example.com" }),
    ).rejects.toThrow("Editor access required");
  });

  it("returns one proposal in full with the live hash of each target", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor, contributor], substanceIndex: [storedLsd] });
    const { proposalId } = await submitHandler(ctx, submitArgs() as never);

    const fresh = await getHandler(ctx, { apiKey: SERVER_KEY, actorEmail: "editor@example.com", id: proposalId });
    expect(fresh).toMatchObject({
      _id: proposalId,
      summary: "Update LSD",
      payload: { articles: [proposedLsd] },
    });
    expect(fresh!.liveHashes).toEqual([{ kind: "article", key: "lsd", hash: fresh!.targets[0].baseHash }]);

    // Production moved under the proposal: the live hash no longer matches the pinned one.
    rowsOf("substanceIndex").set("s1", { ...storedLsd, summary: "Edited since" });
    const drifted = await getHandler(ctx, { apiKey: SERVER_KEY, actorEmail: "editor@example.com", id: proposalId });
    expect(drifted!.liveHashes[0].hash).not.toBe(drifted!.targets[0].baseHash);

    await expect(
      getHandler(ctx, { apiKey: SERVER_KEY, actorEmail: "editor@example.com", id: "changeProposals:99" as never }),
    ).resolves.toBeNull();
    await expect(
      getHandler(ctx, { apiKey: SERVER_KEY, actorEmail: "contributor@example.com", id: proposalId }),
    ).rejects.toThrow("Editor access required");
  });

  it("hides other editors' detail and refuses comments without leaking existence", async () => {
    const other = { ...editor, _id: "m3", email: "other@example.com" };
    const { ctx, rowsOf } = createCtx({ memberships: [editor, other], substanceIndex: [storedLsd] });
    const { proposalId } = await submitHandler(ctx, submitArgs() as never);
    await expect(getHandler(ctx, { apiKey: SERVER_KEY, actorEmail: other.email, id: proposalId })).resolves.toBeNull();
    await expect(commentHandler(ctx, { apiKey: SERVER_KEY, actorEmail: other.email, id: proposalId, text: "Not mine" }))
      .rejects.toMatchObject({ data: { code: "PROPOSAL_NOT_FOUND" } });
    expect(rowsOf("changeProposals").get(proposalId)!.comments).toEqual([]);
    expect(await getHandler(ctx, { apiKey: SERVER_KEY, id: proposalId })).not.toBeNull();
  });

  it("appends a comment under the actor's email and refuses empty text or contributors", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [editor, contributor], substanceIndex: [storedLsd] });
    const { proposalId } = await submitHandler(ctx, submitArgs() as never);

    const comment = await commentHandler(ctx, {
      apiKey: SERVER_KEY,
      actorEmail: "editor@example.com",
      id: proposalId,
      text: "  Looks right to me.  ",
    });
    expect(comment).toMatchObject({ authorName: "Contributor", text: "Looks right to me." });
    expect(comment).not.toHaveProperty("by");
    const stored = rowsOf("changeProposals").get(proposalId)!;
    expect(stored.comments).toEqual([{ by: editor.email, at: comment.at, text: comment.text }]);
    expect(stored.updatedAt).toBe(comment.at);

    await expect(
      commentHandler(ctx, { apiKey: SERVER_KEY, actorEmail: "editor@example.com", id: proposalId, text: "   " }),
    ).rejects.toMatchObject({ data: { code: "PROPOSAL_COMMENT_INVALID" } });
    await expect(
      commentHandler(ctx, {
        apiKey: SERVER_KEY,
        actorEmail: "editor@example.com",
        id: "changeProposals:99" as never,
        text: "Hello",
      }),
    ).rejects.toMatchObject({ data: { code: "PROPOSAL_NOT_FOUND" } });
    await expect(
      commentHandler(ctx, { apiKey: SERVER_KEY, actorEmail: "contributor@example.com", id: proposalId, text: "Hi" }),
    ).rejects.toThrow("Editor access required");
  });

  it("exposes only linked public names and server ownership while preserving private audit identities", async () => {
    const admin = { ...editor, _id: "admin", email: "reviewer@example.com", role: "admin" };
    const { ctx, rowsOf } = createCtx({
      memberships: [editor, admin],
      substanceIndex: [storedLsd],
      contributorProfiles: [
        { _id: "profile-editor", membershipEmail: editor.email, displayName: "Ada" },
        { _id: "profile-admin", membershipEmail: admin.email, displayName: `Private <${admin.email}>` },
      ],
    });
    const { proposalId } = await submitHandler(ctx, submitArgs() as never);
    const row = rowsOf("changeProposals").get(proposalId)!;
    rowsOf("changeProposals").set(proposalId, {
      ...row,
      reviewedBy: admin.email,
      comments: [{ by: admin.email, at: "now", text: "Checked" }],
      payload: {
        articles: [{ ...proposedLsd, submittedBy: { email: editor.email }, contactEmail: admin.email }],
        changelog: { submittedBy: editor.email, markdown: admin.email, articles: [] },
      },
    });

    const mine = await listMineHandler(ctx, { apiKey: SERVER_KEY, actorEmail: editor.email });
    const adminQueue = await listHandler(ctx, { apiKey: SERVER_KEY, actorEmail: admin.email });
    const ownDetail = await getHandler(ctx, { apiKey: SERVER_KEY, actorEmail: editor.email, id: proposalId });
    const adminDetail = await getHandler(ctx, { apiKey: SERVER_KEY, actorEmail: admin.email, id: proposalId });
    for (const result of [mine[0], adminQueue[0], ownDetail, adminDetail]) {
      expect(result).toMatchObject({ proposerName: "Ada", reviewerName: "Reviewer" });
      expect(JSON.stringify(result)).not.toContain(editor.email);
      expect(JSON.stringify(result)).not.toContain(admin.email);
    }
    expect(mine[0].isAuthor).toBe(true);
    expect(ownDetail!.isAuthor).toBe(true);
    expect(adminQueue[0].isAuthor).toBe(false);
    expect(adminDetail!.isAuthor).toBe(false);
    expect(ownDetail!.payload).toEqual({ articles: [proposedLsd] });
    expect(ownDetail!.comments).toEqual([{ authorName: "Contributor", at: "now", text: "Checked" }]);
    expect(rowsOf("changeProposals").get(proposalId)).toMatchObject({
      proposedBy: editor.email, reviewedBy: admin.email,
      comments: [{ by: admin.email, at: "now", text: "Checked" }],
    });

    const comment = await commentHandler(ctx, {
      apiKey: SERVER_KEY, actorEmail: editor.email, id: proposalId, text: "Rechecked",
    });
    expect(comment.authorName).toBe("Ada");
    expect(JSON.stringify(comment)).not.toContain(editor.email);
    rowsOf("contributorProfiles").delete("profile-editor");
    const withoutProfile = await getHandler(ctx, { apiKey: SERVER_KEY, actorEmail: editor.email, id: proposalId });
    expect(withoutProfile).toMatchObject({ proposerName: "Contributor", isAuthor: true });
  });
});

describe("deriveProposalTargets", () => {
  it("names one article target per slug and one layout target per type", async () => {
    const { ctx } = createCtx({ substanceIndex: [storedLsd] });

    await expect(
      deriveProposalTargets(ctx, {
        articles: [proposedLsd, { ...proposedLsd, id: 2, title: "Ketamine HCl", slug: undefined }],
        indexLayouts: [{ type: "psychoactive" }],
      }),
    ).resolves.toEqual([
      { kind: "article", key: "lsd" },
      { kind: "article", key: "ketamine-hcl" },
      { kind: "indexLayout", key: "psychoactive" },
    ]);
  });
});
