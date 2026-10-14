import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MutationCtx } from "@server/postgres/runtime/server";
import { listMineHandler, transition as submissionTransition } from "../server/tripReportSubmissions";

/**
 * Every status transition on an intake item appends one decision log entry. A
 * submitter reading their own submissions sees only the status and the public
 * reason, never the private note or the reviewer.
 */

type RegisteredHandler = { _handler: (ctx: MutationCtx, args: unknown) => Promise<unknown> };
// Postgres's registered function type hides `_handler`; the runtime object always carries it.
const handlerOf = (fn: unknown) => (fn as RegisteredHandler)._handler;

const SERVER_KEY = "test-admin-key";

type Row = Record<string, unknown> & { _id: string };

/** In-memory tables with the `withIndex(...).eq(...)` shape the handlers use (as in dataReviewerIdentity.test.ts). */
function createCtx(seed: Record<string, Row[]>) {
  const tables = new Map<string, Map<string, Row>>();
  for (const [table, rows] of Object.entries(seed)) {
    tables.set(table, new Map(rows.map((row) => [row._id, { ...row }])));
  }
  const rowsOf = (table: string) => {
    if (!tables.has(table)) tables.set(table, new Map());
    return tables.get(table)!;
  };
  let nextId = 1;
  const cursor = (matches: Row[]) => ({
    first: async () => matches[0] ?? null,
    unique: async () => matches[0] ?? null,
    collect: async () => matches,
  });
  const query = (table: string) => ({
    ...cursor([...rowsOf(table).values()]),
    withIndex: (_index: string, select: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
      const filters: [string, unknown][] = [];
      const range = {
        eq: (field: string, value: unknown) => {
          filters.push([field, value]);
          return range;
        },
      };
      select(range);
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
  const ctx = {
    auth: { getUserIdentity: vi.fn(async () => null) },
    db: {
      normalizeId: (table: string, id: string) => (rowsOf(table).has(id) ? id : null),
      get: async (id: string) => find(id)?.existing ?? null,
      query,
      insert: async (table: string, doc: Record<string, unknown>) => {
        const _id = `${table}:${nextId++}`;
        rowsOf(table).set(_id, { _id, ...doc });
        return _id;
      },
      patch: async (id: string, patch: Record<string, unknown>) => {
        const hit = find(id);
        if (hit) hit.rows.set(id, { ...hit.existing, ...patch });
      },
    },
  } as never as MutationCtx;
  return { ctx, rowsOf };
}

const admin: Row = {
  _id: "m0",
  email: "admin@example.com",
  role: "admin",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const as = (actorEmail: string) => ({ apiKey: SERVER_KEY, actorEmail });

const report = {
  title: "Alpine clarity",
  subject: { name: "nervewing" },
  substances: [{ name: "Psilocybin" }],
  introduction: "Cold air.",
  onset: [],
  peak: [],
  offset: [],
  tags: [],
};

const submission = (overrides: Record<string, unknown> = {}): Row => ({
  _id: "s1",
  id: "sub-1",
  status: "submitted",
  schema_version: 1,
  report: structuredClone(report),
  title: report.title,
  author_name: "nervewing",
  substance_names: ["Psilocybin"],
  may_contact: false,
  publish_consent: true,
  age_confirmed: true,
  honeypot_triggered: false,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
  process.env.DATA_ADMIN_KEY = SERVER_KEY;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-01T10:00:00.000Z"));
});

afterEach(() => {
  delete process.env.DATA_ADMIN_KEY;
  vi.useRealTimers();
});

describe("a submitter's own submissions", () => {
  const author: Row = { ...admin, _id: "m2", email: "author@example.com", role: "contributor" };
  const other: Row = { ...admin, _id: "m3", email: "other@example.com", role: "contributor" };

  async function rejectWithReason(ctx: MutationCtx) {
    await handlerOf(submissionTransition)(ctx, {
      ...as("admin@example.com"),
      id: "sub-1",
      status: "rejected",
      notes: "Looks like a copy of an Erowid report.",
      publicReason: "The dose for the second substance is missing.",
    });
  }

  it("shows the author status and public reason only, matched by their signed-in email", async () => {
    const { ctx } = createCtx({
      memberships: [admin, author, other],
      tripReportSubmissions: [
        submission({ contact_email: "Author@Example.com " }),
        submission({ _id: "s2", id: "sub-2", title: "Someone else", contact_email: "other@example.com" }),
        submission({ _id: "s3", id: "sub-3", title: "Junk", status: "spam", contact_email: "author@example.com" }),
      ],
    });
    await rejectWithReason(ctx);

    const mine = await listMineHandler(ctx, as("author@example.com"));

    expect(mine).toEqual([
      {
        id: "sub-1",
        title: "Alpine clarity",
        status: "rejected",
        submitted_at: "2026-01-01T00:00:00.000Z",
        decided_at: "2026-03-01T10:00:00.000Z",
        public_reason: "The dose for the second substance is missing.",
      },
    ]);
    const serialized = JSON.stringify(mine);
    expect(serialized).not.toContain("Erowid");
    expect(serialized).not.toContain("admin@example.com");
  });

  it("never lets another member read it", async () => {
    const { ctx } = createCtx({
      memberships: [admin, author, other],
      tripReportSubmissions: [submission({ contact_email: "author@example.com" })],
    });
    await rejectWithReason(ctx);

    await expect(listMineHandler(ctx, as("other@example.com"))).resolves.toEqual([]);
    // An admin reading "mine" gets only their own too.
    await expect(listMineHandler(ctx, as("admin@example.com"))).resolves.toEqual([]);
    // A server call that names no member is refused rather than read as the system.
    await expect(listMineHandler(ctx, { apiKey: SERVER_KEY })).rejects.toThrow(/signed-in member/);
  });
});
