import { afterEach, describe, expect, it, vi } from "vitest";
import type { MutationCtx } from "@server/postgres/runtime/server";
import { claimDue, recordDelivery } from "../../../../../server/publicationRecovery";

const seams = vi.hoisted(() => ({
  client: null as { mutationAsService: (reference: unknown, args: Record<string, unknown>) => Promise<unknown> } | null,
  dispatch: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: () => seams.client
    ? { ok: true, capability: { client: seams.client } }
    : { ok: false, failure: { message: "missing fixture client" } },
}));
vi.mock("@server/postgres/runtime/backend", () => ({ getDataBackend: () => "postgres" }));
vi.mock("@server/next/publicationDispatch", () => ({ dispatchPublicationSignal: seams.dispatch }));
vi.mock("@server/translation/segmentStore", () => ({ enqueueTranslationJobs: seams.enqueue }));

import { GET, maxDuration } from "./route";

type PublicationRow = {
  _id: string;
  _creationTime: number;
  key: string;
  target: { kind: "article"; slug: string; dependency?: "detail" | "content" | "membership" };
  revision: string;
  generation: number;
  pending: boolean;
  nextAttemptAt: number;
  attempts: number;
  receipts: unknown[];
  committedAt: number;
};

function publicationDatabase(rows: PublicationRow[]) {
  const db = {
    normalizeId: () => null,
    get: async (id: string) => structuredClone(rows.find((row) => row._id === id) ?? null),
    patch: async (...args: unknown[]) => {
      const [id, patch] = args.slice(args.length === 3 ? 1 : 0) as [string, Partial<PublicationRow>];
      const row = rows.find((candidate) => candidate._id === id);
      if (!row) throw new Error(`missing publication ${id}`);
      Object.assign(row, patch);
    },
    query: (table: string) => {
      if (table !== "publicCachePublications") throw new Error(`unexpected table ${table}`);
      const predicates: Array<(row: PublicationRow) => boolean> = [];
      const range = {
        eq: (field: keyof PublicationRow, value: unknown) => {
          predicates.push((row) => row[field] === value);
          return range;
        },
        lte: (field: keyof PublicationRow, value: number) => {
          predicates.push((row) => {
            const current = row[field];
            return typeof current === "number" && current <= value;
          });
          return range;
        },
      };
      const query = {
        withIndex: (_name: string, select: (q: typeof range) => unknown) => {
          select(range);
          return query;
        },
        take: async (count: number) => rows
          .filter((row) => predicates.every((predicate) => predicate(row)))
          .sort((left, right) => left.nextAttemptAt - right.nextAttemptAt || left._creationTime - right._creationTime)
          .slice(0, count)
          .map((row) => structuredClone(row)),
      };
      return query;
    },
  };
  return { db, ctx: { db } as unknown as MutationCtx };
}

type RegisteredHandler = {
  _handler: (context: MutationCtx, input: Record<string, unknown>) => Promise<unknown>;
};

function invoke(handler: unknown, ctx: MutationCtx, args: Record<string, unknown> = {}) {
  // Postgres retains the registered handler at runtime but omits it from the builder type.
  const registered = handler as RegisteredHandler;
  return registered._handler(ctx, args);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  seams.client = null;
  seams.dispatch.mockReset();
  seams.enqueue.mockReset();
  delete process.env.CRON_SECRET;
});

describe("publication delivery receiver-path budget", () => {
  it("claims only three six-row timeout waves without weakening leases or generation receipts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T12:00:00.000Z"));
    process.env.CRON_SECRET = "route-budget-secret";
    const now = Date.now();
    const rows = Array.from({ length: 25 }, (_, index): PublicationRow => ({
      _id: `publicCachePublications:${index + 1}`,
      _creationTime: index + 1,
      key: `article-${index + 1}`,
      target: { kind: "article", slug: `article-${index + 1}` },
      revision: `revision-${index + 1}`,
      generation: index + 101,
      pending: true,
      nextAttemptAt: now - 1,
      attempts: 0,
      receipts: [],
      committedAt: now - 1_000,
    }));
    const { ctx } = publicationDatabase(rows);
    seams.client = {
      mutationAsService: async (_reference, args) => {
        if ("id" in args) {
          return invoke(recordDelivery, ctx, args);
        }
        return invoke(claimDue, ctx, args);
      },
    };
    const dispatchStarts: number[] = [];
    seams.enqueue.mockResolvedValue(undefined);
    seams.dispatch.mockImplementation(async () => {
      dispatchStarts.push(Date.now() - now);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 15_000);
      });
      return [{ target: "https://dose.wiki", status: "accepted", attempts: 2, verification: "verified" }];
    });

    let settled = false;
    const responsePromise = GET(new Request("https://editor.dose.wiki/api/cron/publication-delivery", {
      headers: { authorization: "Bearer route-budget-secret" },
    })).then((response) => {
      settled = true;
      return response;
    });

    await vi.advanceTimersByTimeAsync(44_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const response = await responsePromise;

    expect(maxDuration).toBe(60);
    expect(await response.json()).toEqual({ claimed: 18, completed: 18, retried: 0, skipped: 0 });
    expect(dispatchStarts).toEqual([
      ...Array(6).fill(0),
      ...Array(6).fill(15_000),
      ...Array(6).fill(30_000),
    ]);
    expect(rows.slice(0, 18).every((row) => !row.pending && row.attempts === 1)).toBe(true);

    const remainderClaimedAt = Date.now();
    const remainder = await invoke(claimDue, ctx) as PublicationRow[];
    expect(remainder.map((row) => row._id)).toEqual(rows.slice(18).map((row) => row._id));
    expect(rows.slice(18).every((row) =>
      row.pending && row.attempts === 1 && row.nextAttemptAt === remainderClaimedAt + 120_000)).toBe(true);

    const newer = rows[18];
    newer.generation += 1;
    newer.nextAttemptAt = now;
    const beforeStaleReceipt = structuredClone(newer);
    await invoke(recordDelivery, ctx, {
      id: newer._id,
      generation: newer.generation - 1,
      complete: true,
      receipts: [{ target: "stale", status: "accepted", attempts: 2 }],
    });
    expect(newer).toEqual(beforeStaleReceipt);
  });

});

describe("durable locale intent before public delivery", () => {
  it("keeps enqueue failures retryable and cannot dispatch or acknowledge before enqueue settles", async () => {
    process.env.CRON_SECRET = "enqueue-fixture";
    const row: PublicationRow = {
      _id: "publication-fixture", _creationTime: 1, key: "article-fixture",
      target: { kind: "article", slug: "fixture", dependency: "detail" }, revision: "revision", generation: 1,
      pending: true, nextAttemptAt: 0, attempts: 0, receipts: [], committedAt: 1,
    };
    const { ctx } = publicationDatabase([row]);
    seams.client = { mutationAsService: async (_reference, args) =>
      invoke("id" in args ? recordDelivery : claimDue, ctx, args) };
    const request = () => new Request("https://editor.dose.wiki/api/cron/publication-delivery", {
      headers: { authorization: "Bearer enqueue-fixture" },
    });
    seams.enqueue.mockRejectedValueOnce(new Error("queue unavailable"));
    expect(await (await GET(request())).json()).toMatchObject({ completed: 0, retried: 1 });
    expect(row.pending).toBe(true);
    expect(seams.dispatch).not.toHaveBeenCalled();

    row.nextAttemptAt = 0;
    let release!: () => void;
    const enqueued = new Promise<void>((resolve) => { release = resolve; });
    seams.enqueue.mockImplementationOnce(() => enqueued);
    seams.dispatch.mockResolvedValue([{ target: "public", status: "accepted", attempts: 1, verification: "verified" }]);
    const delivery = GET(request());
    await vi.waitFor(() => expect(seams.enqueue).toHaveBeenCalledTimes(2));
    expect(row.pending).toBe(true);
    expect(seams.dispatch).not.toHaveBeenCalled();
    release();
    expect(await (await delivery).json()).toMatchObject({ completed: 1, retried: 0 });
    expect(row.pending).toBe(false);
  });
});
