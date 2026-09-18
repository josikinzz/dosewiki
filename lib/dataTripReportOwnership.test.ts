import { PostgresError } from "@server/postgres/runtime/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MutationCtx } from "@server/postgres/runtime/server";
import { getPortalRecord } from "../server/tripReports";
import { assignOwnerHandler, listOwnedHandler, updateHandler } from "../server/lib/tripReportPortalHandlers";
import { create, promoteHandler } from "../server/tripReportSubmissions";

// Postgres registered functions keep the original handler on `_handler`; there is
// no in-repo Postgres runtime harness, so the handler is exercised directly.
type RegisteredHandler = { _handler: (ctx: MutationCtx, args: unknown) => Promise<unknown> };
const handlerOf = (fn: unknown) => {
  // Postgres's RegisteredMutation type hides `_handler`; the runtime object always carries it.
  const registered = fn as RegisteredHandler;
  return registered._handler;
};

const SERVER_KEY = "test-admin-key";

type Row = Record<string, unknown> & { _id: string };

type FakeDb = { ctx: MutationCtx; rowsOf: (table: string) => Map<string, Row> };
type Cursor = {
  first: () => Promise<Row | null>;
  unique: () => Promise<Row | null>;
  collect: () => Promise<Row[]>;
  order: (direction: "asc" | "desc") => Cursor;
};

/**
 * In-memory tables with the `withIndex(...).eq(field, value)` shape the
 * handlers use: `memberships.by_email` for `requireRole` and the owner
 * lookups, `tripReports.by_slug` / `by_owner_email`, `tripReportSubmissions.by_public_id`,
 * `tripReportSubstances.by_report`, and the unindexed `contributorProfiles`
 * collect the byline guard performs.
 */
function createCtx(seed: Record<string, Row[]>): FakeDb {
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
  const cursor = (matches: Row[]): Cursor => ({
    first: async () => matches[0] ?? null,
    unique: async () => {
      if (matches.length > 1) {
        throw new Error(`index returned ${matches.length} rows`);
      }
      return matches[0] ?? null;
    },
    collect: async () => matches,
    order: (direction) => cursor([...matches].sort((a, b) => (Number(a._creationTime ?? 0) - Number(b._creationTime ?? 0)) * (direction === "desc" ? -1 : 1))),
  });
  const query = (table: string) => ({
    ...cursor([...rowsOf(table).values()]),
    withIndex: (
      _indexName: string,
      selector: (query: { eq: (field: string, value: unknown) => unknown }) => unknown,
    ) => {
      const filters: [string, unknown][] = [];
      const index: { eq: (field: string, value: unknown) => unknown } = {
        eq: (field: string, value: unknown) => {
          filters.push([field, value]);
          return index;
        },
      };
      selector(index);
      return cursor([...rowsOf(table).values()].filter((row) => filters.every(([field, value]) => row[field] === value)));
    },
  });
  const find = (id: string) => {
    for (const rows of tables.values()) {
      const existing = rows.get(id);
      if (existing) return { rows, existing };
    }
    return null;
  };

  return {
    ctx: {
      auth: { getUserIdentity: vi.fn(async () => null) },
      db: {
        normalizeId: (table: string, id: string) => rowsOf(table).has(id) || id.startsWith(`${table}:`) ? id : null,
        get: vi.fn(async (id: string) => find(id)?.existing ?? null),
        query: vi.fn(query),
        insert: vi.fn(async (table: string, doc: Record<string, unknown>) => {
          const _id = `${table}:${nextId++}`;
          rowsOf(table).set(_id, { _id, _creationTime: nextId, ...doc });
          return _id;
        }),
        patch: vi.fn(async (id: string, patch: Record<string, unknown>) => {
          const hit = find(id);
          if (hit) hit.rows.set(id, { ...hit.existing, ...patch });
        }),
        delete: vi.fn(async (id: string) => {
          find(id)?.rows.delete(id);
        }),
      },
    } as never,
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
const owner: Row = { ...admin, _id: "m2", email: "owner@example.com", role: "contributor" };
const other: Row = { ...admin, _id: "m3", email: "other@example.com", role: "contributor" };

const fields = {
  title: "Alpine clarity",
  subject: { name: "nervewing" },
  substances: [{ name: "Psilocybin" }],
  introduction: "Cold air.",
  onset: [{ time: "T+0:30", description: "Cold air sharpens." }],
  peak: [],
  offset: [],
  tags: ["outdoors"],
};

const ownedReport: Row = {
  _id: "r1",
  _creationTime: 1700000000000,
  slug: "alpine-clarity",
  owner_email: "owner@example.com",
  ...structuredClone(fields),
};

const unownedReport: Row = {
  _id: "r2",
  _creationTime: 1700000001000,
  slug: "quiet-river",
  ...structuredClone(fields),
  title: "Quiet river",
};

function as(actorEmail: string | undefined) {
  return { apiKey: SERVER_KEY, actorEmail };
}

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PostgresError) {
      return (error as PostgresError<{ code: string }>).data.code;
    }
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a rejection");
}

beforeEach(() => {
  process.env.DATA_ADMIN_KEY = SERVER_KEY;
});

afterEach(() => {
  delete process.env.DATA_ADMIN_KEY;
});

describe("tripReportSubmissions.promote ownership", () => {
  const submission: Row = {
    _id: "s1",
    id: "sub-1",
    status: "accepted",
    schema_version: 1,
    report: structuredClone(fields),
    title: fields.title,
    author_name: "nervewing",
    substance_names: ["Psilocybin"],
    may_contact: true,
    publish_consent: true,
    age_confirmed: true,
    honeypot_triggered: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };

  it("sets owner_email when the contact email matches a member, case-insensitively", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin, owner],
      tripReportSubmissions: [{ ...submission, contact_email: "Owner@Example.com " }],
    });

    const result = await promoteHandler(ctx, { ...as("admin@example.com"), id: "sub-1", reviewer: "Admin" });

    expect(rowsOf("tripReports").get(result.reportId)?.owner_email).toBe("owner@example.com");
  });

  it("leaves owner_email unset when no member has the contact email, or none was given", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin, owner],
      tripReportSubmissions: [
        { ...submission, contact_email: "stranger@example.com" },
        { ...submission, _id: "s2", id: "sub-2" },
      ],
    });

    const first = await promoteHandler(ctx, { ...as("admin@example.com"), id: "sub-1", reviewer: "Admin" });
    const second = await promoteHandler(ctx, { ...as("admin@example.com"), id: "sub-2", reviewer: "Admin" });

    expect(rowsOf("tripReports").get(first.reportId)).not.toHaveProperty("owner_email");
    expect(rowsOf("tripReports").get(second.reportId)).not.toHaveProperty("owner_email");
  });
});

async function readReportRevision(db: FakeDb, id = "r1"): Promise<string> {
  const record = await handlerOf(getPortalRecord)(db.ctx, { ...as("admin@example.com"), id }) as { revision: string };
  return record.revision;
}

describe("tripReports.update ownership", () => {
  let current: FakeDb;

  const save = async (actorEmail: string, updates: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    updateHandler(current.ctx, {
      ...as(actorEmail),
      id: "r1" as never,
      expected: fields,
      expectedRevision: await readReportRevision(current),
      updates: { ...fields, ...updates },
      ...extra,
    } as never);

  beforeEach(() => {
    current = createCtx({
      memberships: [admin, editor, owner, other],
      tripReports: [ownedReport, unownedReport],
    });
  });

  it("rejects a stale revision after an A-to-B-to-A correction cycle", async () => {
    const expectedRevision = await readReportRevision(current);
    await save("owner@example.com", { title: "Intermediate title" });
    await save("owner@example.com", { title: fields.title }, { expected: { ...fields, title: "Intermediate title" } });

    await expect(save("owner@example.com", { conclusion: "Stale correction" }, { expectedRevision })).rejects.toMatchObject({
      data: { code: "REPORT_CONFLICT" },
    });
    expect(current.rowsOf("tripReports").get("r1")?.conclusion).toBeUndefined();
    expect(current.rowsOf("contentRevisions").size).toBe(2);
  });

  it("rejects a stale correction after attribution changes without editable text changes", async () => {
    const expectedRevision = await readReportRevision(current);
    await current.ctx.db.patch("r1" as never, { subject: { ...fields.subject, profile_key: "REASSIGNED" } });

    await expect(save("owner@example.com", { conclusion: "Stale correction" }, { expectedRevision })).rejects.toMatchObject({
      data: { code: "REPORT_CONFLICT" },
    });
    expect(current.rowsOf("tripReports").get("r1")?.subject).toMatchObject({ profile_key: "REASSIGNED" });
    expect(current.rowsOf("contentRevisions").size).toBe(0);
  });

  it("lets the owner change content fields", async () => {
    await save("owner@example.com", {
      title: "Alpine clarity, revisited",
      conclusion: "Worth it.",
      tags: ["outdoors", "winter"],
    });

    const stored = current.rowsOf("tripReports").get("r1")!;
    expect(stored.title).toBe("Alpine clarity, revisited");
    expect(stored.conclusion).toBe("Worth it.");
    expect(stored.tags).toEqual(["outdoors", "winter"]);
    expect(stored.owner_email).toBe("owner@example.com");
  });

  it("refuses a contributor who does not own the report with NOT_OWNER", async () => {
    expect(await rejection(save("other@example.com", { title: "Mine now" }))).toBe("NOT_OWNER");
    expect(current.rowsOf("tripReports").get("r1")?.title).toBe("Alpine clarity");
  });

  it("refuses a contributor on an unowned report", async () => {
    const code = await rejection(
      updateHandler(current.ctx, {
        ...as("owner@example.com"),
        id: "r2" as never,
        expected: { ...fields, title: "Quiet river" },
        updates: { ...fields, title: "Quiet river, mine" },
      } as never),
    );
    expect(code).toBe("NOT_OWNER");
  });

  it("refuses the owner on featured, slug, and attribution", async () => {
    expect(await rejection(save("owner@example.com", { featured: true }))).toBe("EDITOR_ONLY_REPORT_FIELD");
    expect(await rejection(save("owner@example.com", { slug: "new-slug" }))).toBe("EDITOR_ONLY_REPORT_FIELD");
    expect(await rejection(save("owner@example.com", {}, { profileKey: "NERVEWING" }))).toBe(
      "EDITOR_ONLY_REPORT_FIELD",
    );
    expect(await rejection(save("owner@example.com", { subject: { name: "somebody else" } }))).toBe(
      "EDITOR_ONLY_REPORT_FIELD",
    );
    expect(current.rowsOf("tripReports").get("r1")?.slug).toBe("alpine-clarity");
  });

  it("refuses an editor on a report they do not own with NOT_OWNER", async () => {
    expect(await rejection(save("editor@example.com", { title: "Edited by staff" }))).toBe("NOT_OWNER");
    expect(current.rowsOf("tripReports").get("r1")?.title).toBe("Alpine clarity");
  });

  it("holds an editor who owns a report to content fields", async () => {
    current = createCtx({
      memberships: [admin, editor],
      tripReports: [{ ...ownedReport, owner_email: "editor@example.com" }],
    });

    expect(await rejection(save("editor@example.com", {}, { profileKey: "NERVEWING" }))).toBe(
      "EDITOR_ONLY_REPORT_FIELD",
    );
    const result = await save("editor@example.com", { title: "Mine, retitled" });
    expect(result.updated).toBe(true);
    expect(current.rowsOf("tripReports").get("r1")?.title).toBe("Mine, retitled");
  });

  it("keeps the admin path: an admin saves a report they do not own", async () => {
    const result = await save("admin@example.com", { title: "Edited by staff" });

    expect(result.updated).toBe(true);
    expect(current.rowsOf("tripReports").get("r1")?.title).toBe("Edited by staff");
  });

  it("refuses a viewer below the contributor floor", async () => {
    current = createCtx({
      memberships: [{ ...other, email: "viewer@example.com", role: "viewer" }],
      tripReports: [ownedReport],
    });
    await expect(save("viewer@example.com", { title: "x" })).rejects.toThrow(/Contributor access required/);
  });
});

describe("trip report attribution boundary", () => {
  const profile: Row = { _id: "p1", key: "NERVEWING", displayName: "nervewing", aliases: [] };
  const submissionFacts = {
    schema_version: 1,
    title: fields.title,
    substance_names: ["Psilocybin"],
    may_contact: false,
    publish_consent: true,
    age_confirmed: true,
    honeypot_triggered: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };

  it("strips submitter-claimed profile_key, avatar_url, and pdf_url on intake", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin] });
    const submission = {
      ...submissionFacts,
      id: "sub-x",
      status: "submitted",
      author_name: "Impersonator",
      report: {
        ...structuredClone(fields),
        subject: {
          name: "Impersonator",
          profile_key: "NERVEWING",
          avatar_url: "https://x/face.png",
          pdf_url: "https://x/t.pdf",
        },
      },
    };

    await handlerOf(create)(ctx, { apiKey: SERVER_KEY, submission });

    const stored = [...rowsOf("tripReportSubmissions").values()][0]!.report as { subject: Record<string, unknown> };
    expect(stored.subject).toEqual({ name: "Impersonator" });
  });

  it("refuses to promote a byline that matches a contributor unless the editor adjudicates it", async () => {
    const submission: Row = {
      ...submissionFacts,
      _id: "s1",
      id: "sub-1",
      status: "accepted",
      report: structuredClone(fields),
      author_name: "nervewing",
    };
    const seed = () =>
      createCtx({ memberships: [admin], contributorProfiles: [profile], tripReportSubmissions: [submission] });
    const promote = (db: FakeDb, extra: Record<string, unknown> = {}) =>
      promoteHandler(db.ctx, { ...as("admin@example.com"), id: "sub-1", reviewer: "Admin", ...extra });

    await expect(promote(seed())).rejects.toThrow(/matches contributor profile "NERVEWING"/);
    await expect(promote(seed(), { profileKey: "UNKNOWN" })).rejects.toThrow(/Contributor profile "UNKNOWN" not found/);

    const assigned = seed();
    const assignedResult = await promote(assigned, { profileKey: "nervewing" });
    expect(assigned.rowsOf("tripReports").get(assignedResult.reportId)).toMatchObject({
      subject: { name: "nervewing", profile_key: "NERVEWING" },
      attribution_review: { decision: "assigned" },
    });

    const declined = seed();
    const declinedResult = await promote(declined, { confirmAuthorNameClaim: true });
    const declinedReport = declined.rowsOf("tripReports").get(declinedResult.reportId);
    expect(declinedReport).toMatchObject({ attribution_review: { decision: "declined" } });
    expect(declinedReport?.subject).not.toHaveProperty("profile_key");
  });

  it("refuses a stale save, keeps editor-set subject links, and re-adjudicates only a moved byline", async () => {
    const reviewed: Row = {
      ...ownedReport,
      subject: { name: "nervewing", avatar_url: "https://cdn/face.png", pdf_url: "https://cdn/r.pdf" },
      attribution_review: { reviewed_by: "Admin", reviewed_at: "2026-01-01T00:00:00.000Z", decision: "declined" },
    };
    const seed = () => createCtx({ memberships: [admin], contributorProfiles: [profile], tripReports: [reviewed] });
    const expected = { ...fields, subject: { name: "nervewing" } };
    const save = async (db: FakeDb, args: Record<string, unknown>) =>
      updateHandler(db.ctx, { ...as("admin@example.com"), id: "r1" as never, expected, expectedRevision: await readReportRevision(db), updates: expected, ...args } as never);

    await expect(save(seed(), { expected: { ...expected, title: "Something else" } })).rejects.toMatchObject({
      data: { code: "REPORT_CONFLICT" },
    });

    const unchanged = seed();
    await save(unchanged, { updates: { ...expected, title: "Retitled" } });
    expect(unchanged.rowsOf("tripReports").get("r1")).toMatchObject({
      title: "Retitled",
      slug: "alpine-clarity",
      subject: { name: "nervewing", avatar_url: "https://cdn/face.png", pdf_url: "https://cdn/r.pdf" },
      attribution_review: { decision: "declined", reviewed_by: "Admin" },
    });

    // Case and whitespace are not a moved byline: `normalizeAuthorMatchName` equalizes them.
    await expect(save(seed(), { updates: { ...expected, subject: { name: "NerveWing " } } })).resolves.toMatchObject({
      updated: true,
    });

    const movedTo = seed();
    await save(movedTo, { updates: { ...expected, subject: { name: "somebody" } }, profileKey: "NERVEWING" });
    expect(movedTo.rowsOf("tripReports").get("r1")).toMatchObject({
      subject: { name: "somebody", profile_key: "NERVEWING" },
      attribution_review: { decision: "assigned", reviewed_by: expect.any(String) },
    });
  });
});

describe("tripReports.listOwned", () => {
  it("returns only the actor's reports for a contributor", async () => {
    const { ctx } = createCtx({
      memberships: [owner, other],
      tripReports: [ownedReport, unownedReport, { ...ownedReport, _id: "r3", slug: "second", owner_email: "other@example.com" }],
    });

    const mine = await listOwnedHandler(ctx, as("owner@example.com"));

    expect(mine.map((row) => row.slug)).toEqual(["alpine-clarity"]);
    expect(mine[0]).toMatchObject({ id: "r1", title: "Alpine clarity", ownerEmail: "owner@example.com" });
  });

  it("lets an admin list every owned report and refuses a contributor asking for all", async () => {
    const { ctx } = createCtx({
      memberships: [admin, owner],
      tripReports: [ownedReport, unownedReport],
    });

    const all = await listOwnedHandler(ctx, { ...as("admin@example.com"), all: true });
    expect(all.map((row) => row.slug)).toEqual(["alpine-clarity"]);

    expect(await rejection(listOwnedHandler(ctx, { ...as("owner@example.com"), all: true }))).toBe("FORBIDDEN");
  });
});

describe("tripReports.assignOwner", () => {
  it("lets an admin reassign a report to an existing member, normalizing the email", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin, owner, other],
      tripReports: [ownedReport],
    });

    const result = await assignOwnerHandler(ctx, {
      ...as("admin@example.com"),
      slug: "alpine-clarity",
      email: " Other@Example.com ",
    });

    expect(result).toEqual({ slug: "alpine-clarity", ownerEmail: "other@example.com" });
    expect(rowsOf("tripReports").get("r1")?.owner_email).toBe("other@example.com");
  });

  it("refuses an unknown member, an unknown slug, and a non-admin", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin, editor, owner],
      tripReports: [ownedReport],
    });

    expect(
      await rejection(assignOwnerHandler(ctx, { ...as("admin@example.com"), slug: "alpine-clarity", email: "nobody@example.com" })),
    ).toBe("MEMBER_NOT_FOUND");
    expect(
      await rejection(assignOwnerHandler(ctx, { ...as("admin@example.com"), slug: "missing", email: "owner@example.com" })),
    ).toBe("REPORT_NOT_FOUND");
    await expect(
      assignOwnerHandler(ctx, { ...as("editor@example.com"), slug: "alpine-clarity", email: "owner@example.com" }),
    ).rejects.toThrow(/Admin access required/);
    expect(rowsOf("tripReports").get("r1")?.owner_email).toBe("owner@example.com");
  });
});
