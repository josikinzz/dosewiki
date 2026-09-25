import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MutationCtx } from "@server/postgres/runtime/server";
import {
  create as articleFeedbackCreate,
  transition as articleFeedbackTransition,
} from "../server/articleFeedback";
import { transition as siteFeedbackTransition } from "../server/siteFeedback";
import {
  create as submissionCreate,
  get as submissionGet,
  promoteHandler,
  transition as submissionTransition,
} from "../server/tripReportSubmissions";

/**
 * Every status transition on an intake item appends one decision log entry
 * `{ at, actor, from, to, note }`; nothing earlier is overwritten. A row
 * decided before the log existed reads its review note back as a migrated
 * first entry, and the next transition stores that entry ahead of its own.
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
const secondAdmin: Row = { ...admin, _id: "m1", email: "second@example.com" };

const as = (actorEmail: string) => ({ apiKey: SERVER_KEY, actorEmail });

type LoggedRow = {
  status: string;
  review_notes?: string;
  decision_log?: Record<string, unknown>[];
};

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

const feedbackRow = (overrides: Record<string, unknown> = {}): Row => ({
  _id: "f1",
  id: "feedback-1",
  status: "new",
  schema_version: 1,
  substance_slug: "lsd",
  substance_title: "LSD",
  category: "other",
  importance: "normal",
  details: "Detail.",
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

describe("trip report submission decision log", () => {
  it("records two transitions as two entries, in order, with who, when, from, to and why", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin, secondAdmin], tripReportSubmissions: [submission()] });

    await handlerOf(submissionTransition)(ctx, { ...as("admin@example.com"), id: "sub-1", status: "reviewing" });
    vi.setSystemTime(new Date("2026-03-02T11:30:00.000Z"));
    const result = (await handlerOf(submissionTransition)(ctx, {
      ...as("second@example.com"),
      id: "sub-1",
      status: "rejected",
      notes: "No dose given for the second substance.",
    })) as LoggedRow;

    const expected = [
      { at: "2026-03-01T10:00:00.000Z", actor: "admin@example.com", from: "submitted", to: "reviewing" },
      {
        at: "2026-03-02T11:30:00.000Z",
        actor: "second@example.com",
        from: "reviewing",
        to: "rejected",
        note: "No dose given for the second substance.",
      },
    ];
    expect(result.decision_log).toEqual(expected);
    expect(rowsOf("tripReportSubmissions").get("s1")?.decision_log).toEqual(expected);
    // The single note field stays current for readers that still use it.
    expect(result.review_notes).toBe("No dose given for the second substance.");
  });

  it("reads an existing review note back as a migrated first entry, and keeps it when the next decision is stored", async () => {
    const legacy = submission({
      status: "rejected",
      review_notes: "Duplicate of an earlier submission.",
      reviewed_by: "admin@example.com",
      reviewed_at: "2026-02-01T09:00:00.000Z",
    });
    const { ctx, rowsOf } = createCtx({ memberships: [admin], tripReportSubmissions: [legacy] });
    const migrated = {
      at: "2026-02-01T09:00:00.000Z",
      actor: "admin@example.com",
      to: "rejected",
      note: "Duplicate of an earlier submission.",
      migrated: true,
    };

    const read = (await handlerOf(submissionGet)(ctx, { ...as("admin@example.com"), id: "sub-1" })) as LoggedRow;
    expect(read.decision_log).toEqual([migrated]);
    // Reading writes nothing.
    expect(rowsOf("tripReportSubmissions").get("s1")).not.toHaveProperty("decision_log");

    await handlerOf(submissionTransition)(ctx, { ...as("admin@example.com"), id: "sub-1", status: "reviewing" });

    expect(rowsOf("tripReportSubmissions").get("s1")?.decision_log).toEqual([
      migrated,
      { at: "2026-03-01T10:00:00.000Z", actor: "admin@example.com", from: "rejected", to: "reviewing" },
    ]);
    expect(rowsOf("tripReportSubmissions").get("s1")?.review_notes).toBe("Duplicate of an earlier submission.");
  });

  it("logs publishing as a decision from accepted to exported", async () => {
    const { ctx } = createCtx({ memberships: [admin], tripReportSubmissions: [submission({ status: "accepted" })] });

    const result = await promoteHandler(ctx, { ...as("admin@example.com"), id: "sub-1", notes: "Clear and complete." });

    expect(result.submission.decision_log).toEqual([
      {
        at: "2026-03-01T10:00:00.000Z",
        actor: "admin@example.com",
        from: "accepted",
        to: "exported",
        note: "Clear and complete.",
      },
    ]);
  });

  it("never stores a decision log supplied with a new submission", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin] });
    const { _id: _ignored, ...incoming } = submission({
      decision_log: [{ at: "2026-01-01T00:00:00.000Z", actor: "forged", from: "submitted", to: "accepted" }],
    });

    await handlerOf(submissionCreate)(ctx, { apiKey: SERVER_KEY, submission: incoming });

    const [stored] = [...rowsOf("tripReportSubmissions").values()];
    expect(stored).toBeDefined();
    expect(stored).not.toHaveProperty("decision_log");
  });
});

describe("feedback decision log", () => {
  it.each([
    ["articleFeedback", articleFeedbackTransition],
    ["siteFeedback", siteFeedbackTransition],
  ] as const)("%s records two transitions as two entries, in order", async (table, transition) => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin, secondAdmin], [table]: [feedbackRow()] });

    await handlerOf(transition)(ctx, { ...as("admin@example.com"), id: "feedback-1", status: "reviewing" });
    vi.setSystemTime(new Date("2026-03-02T11:30:00.000Z"));
    const result = (await handlerOf(transition)(ctx, {
      ...as("second@example.com"),
      id: "feedback-1",
      status: "resolved",
      note: "Fixed the dosage table.",
    })) as LoggedRow;

    const expected = [
      { at: "2026-03-01T10:00:00.000Z", actor: "admin@example.com", from: "new", to: "reviewing" },
      {
        at: "2026-03-02T11:30:00.000Z",
        actor: "second@example.com",
        from: "reviewing",
        to: "resolved",
        note: "Fixed the dosage table.",
      },
    ];
    expect(result.decision_log).toEqual(expected);
    expect(rowsOf(table).get("f1")?.decision_log).toEqual(expected);
  });

  it("carries an existing review note into the log as the migrated first entry", async () => {
    const { ctx, rowsOf } = createCtx({
      memberships: [admin],
      articleFeedback: [
        feedbackRow({
          status: "resolved",
          review_notes: "Source added.",
          reviewed_by: "admin@example.com",
          reviewed_at: "2026-02-01T09:00:00.000Z",
        }),
      ],
    });

    await handlerOf(articleFeedbackTransition)(ctx, { ...as("admin@example.com"), id: "feedback-1", status: "reviewing" });

    expect(rowsOf("articleFeedback").get("f1")?.decision_log).toEqual([
      { at: "2026-02-01T09:00:00.000Z", actor: "admin@example.com", to: "resolved", note: "Source added.", migrated: true },
      { at: "2026-03-01T10:00:00.000Z", actor: "admin@example.com", from: "resolved", to: "reviewing" },
    ]);
  });

  it("never stores a decision log supplied with new feedback", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin] });
    const { _id: _ignored, ...incoming } = feedbackRow({
      decision_log: [{ at: "2026-01-01T00:00:00.000Z", actor: "forged", to: "resolved" }],
    });

    await handlerOf(articleFeedbackCreate)(ctx, { apiKey: SERVER_KEY, feedback: incoming });

    const [stored] = [...rowsOf("articleFeedback").values()];
    expect(stored).toBeDefined();
    expect(stored).not.toHaveProperty("decision_log");
  });
});
