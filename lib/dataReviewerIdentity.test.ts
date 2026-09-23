import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MutationCtx } from "@server/postgres/runtime/server";
import { transition as articleFeedbackTransition } from "../server/articleFeedback";
import { transition as siteFeedbackTransition } from "../server/siteFeedback";
import {
  previewPromotion,
  promoteHandler,
  transition as submissionTransition,
} from "../server/tripReportSubmissions";

/**
 * Status and promote callables stamp the reviewer from the resolved actor. A
 * caller-supplied `reviewer` is not part of any of these contracts, so even a
 * request that still carries one records who actually made the change.
 */

type RegisteredHandler = { _handler: (ctx: MutationCtx, args: unknown) => Promise<unknown> };
// Postgres's registered function type hides `_handler`; the runtime object always carries it.
const handlerOf = (fn: unknown) => (fn as RegisteredHandler)._handler;

const SERVER_KEY = "test-admin-key";

type Row = Record<string, unknown> & { _id: string };

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
const editor: Row = { ...admin, _id: "m1", email: "editor@example.com", role: "editor" };

const asAdmin = { apiKey: SERVER_KEY, actorEmail: "admin@example.com" };
const FORGED = "Someone Else";

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

const submission = (status: string): Row => ({
  _id: "s1",
  id: "sub-1",
  status,
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
});

beforeEach(() => {
  process.env.DATA_ADMIN_KEY = SERVER_KEY;
});

afterEach(() => {
  delete process.env.DATA_ADMIN_KEY;
});

describe("reviewer identity comes from the resolved actor", () => {
  it.each([
    ["articleFeedback", articleFeedbackTransition],
    ["siteFeedback", siteFeedbackTransition],
  ] as const)("%s.transition stores the actor, not a supplied reviewer", async (table, transition) => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin], [table]: [feedbackRow()] });

    const result = await handlerOf(transition)(ctx, {
      ...asAdmin,
      id: "feedback-1",
      status: "reviewing",
      reviewer: FORGED,
    });

    expect(result).toMatchObject({ reviewed_by: "admin@example.com" });
    expect(rowsOf(table).get("f1")?.reviewed_by).toBe("admin@example.com");
  });

  it("tripReportSubmissions.transition stores the actor, not a supplied reviewer", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin], tripReportSubmissions: [submission("submitted")] });

    await handlerOf(submissionTransition)(ctx, { ...asAdmin, id: "sub-1", status: "reviewing", reviewer: FORGED });

    expect(rowsOf("tripReportSubmissions").get("s1")?.reviewed_by).toBe("admin@example.com");
  });

  it("tripReportSubmissions.promote stamps the actor on the submission and the attribution review", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin], tripReportSubmissions: [submission("accepted")] });

    const result = await promoteHandler(ctx, { ...asAdmin, id: "sub-1", reviewer: FORGED } as never);

    expect(rowsOf("tripReportSubmissions").get("s1")?.reviewed_by).toBe("admin@example.com");
    expect(result.payload.attribution_review).toMatchObject({ reviewed_by: "admin@example.com" });
  });

  it("tripReportSubmissions.previewPromotion previews the actor as the attribution reviewer", async () => {
    const { ctx } = createCtx({ memberships: [admin, editor], tripReportSubmissions: [submission("accepted")] });

    const result = await handlerOf(previewPromotion)(ctx, {
      apiKey: SERVER_KEY,
      actorEmail: "editor@example.com",
      id: "sub-1",
      reviewer: FORGED,
    }) as { payload: { attribution_review: { reviewed_by: string } } };

    expect(result.payload.attribution_review.reviewed_by).toBe("editor@example.com");
  });

  it("stamps a maintenance-key caller as the service identity, never a supplied name", async () => {
    const { ctx, rowsOf } = createCtx({ memberships: [admin], articleFeedback: [feedbackRow()] });

    await handlerOf(articleFeedbackTransition)(ctx, {
      apiKey: SERVER_KEY,
      id: "feedback-1",
      status: "reviewing",
      reviewer: FORGED,
    });

    expect(rowsOf("articleFeedback").get("f1")?.reviewed_by).not.toBe(FORGED);
  });
});
