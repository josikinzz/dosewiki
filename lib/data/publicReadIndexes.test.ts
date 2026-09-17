import { describe, expect, it } from "vitest";
import type { MutationCtx } from "@server/postgres/runtime/server";
import { mutation, withPublicReadIndexes } from "../../server/lib/indexedMutation";
import { backfillPublicReadIndexPage } from "../../server/lib/publicReadIndexBackfill";
import { publicReadIndexReady } from "../../server/lib/publicReadIndexes";
import { getPublicReviewedArticlesPageHandler } from "../../server/lib/substanceReadHandlers";
import { getPublicGalleryBySubstanceHandler } from "../../server/lib/substanceGalleryPublicReads";
import { getByArticleSlug } from "../../server/changelog";
import { claimDue, recordDelivery } from "../../server/publicationRecovery";

type Row = Record<string, unknown> & { _id: string; _creationTime: number };
type Predicate = (row: Row) => boolean;

function database() {
  const tables: Record<string, Row[]> = {};
  let next = 1;
  let failingTable: string | null = null;
  const rows = (name: string) => tables[name] ??= [];
  const field = (name: string) => (row: Row) => row[name];
  const expressions = {
    field,
    gt: (left: (row: Row) => unknown, value: unknown): Predicate => (row) => {
      const current = left(row);
      if (typeof current === "number" && typeof value === "number") return current > value;
      if (typeof current === "string" && typeof value === "string") return current > value;
      throw new Error("Unsupported fixture comparison");
    },
    or: (...predicates: Predicate[]): Predicate => (row) => predicates.some((predicate) => predicate(row)),
  };
  const db = {
    normalizeId: (table: string, id: string) => id.startsWith(`${table}:`) ? id : null,
    get: async (id: string) => structuredClone(Object.values(tables).flat().find((row) => row._id === id) ?? null),
    table: (name: string) => ({
      get: (id: string): Promise<Row | null> => db.get(id),
      insert: (value: Record<string, unknown>): Promise<string> => db.insert(name, value),
      patch: (id: string, value: Record<string, unknown>): Promise<void> => db.patch(name, id, value),
      replace: (id: string, value: Record<string, unknown>): Promise<void> => db.replace(name, id, value),
      delete: (id: string): Promise<void> => db.delete(name, id),
    }),
    insert: async (table: string, value: Record<string, unknown>) => {
      if (table === failingTable) throw new Error("Injected index failure");
      const ordinal = next++;
      const row = { ...value, _id: `${table}:${String(ordinal).padStart(5, "0")}`, _creationTime: ordinal };
      rows(table).push(row);
      return row._id;
    },
    patch: async (...args: unknown[]) => {
      const [id, patch] = args.slice(args.length === 3 ? 1 : 0) as [string, Record<string, unknown>];
      const row = Object.values(tables).flat().find((row) => row._id === id);
      if (!row) throw new Error("Missing row");
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete row[key]; else row[key] = value;
      }
    },
    replace: async (...args: unknown[]) => {
      const [id, value] = args.slice(args.length === 3 ? 1 : 0) as [string, Record<string, unknown>];
      const row = Object.values(tables).flat().find((row) => row._id === id);
      if (!row) throw new Error("Missing row");
      const created = row._creationTime;
      for (const key of Object.keys(row)) delete row[key];
      Object.assign(row, value, { _id: id, _creationTime: created });
    },
    delete: async (...args: string[]) => {
      const id = args[args.length - 1];
      for (const values of Object.values(tables)) {
        const index = values.findIndex((row) => row._id === id);
        if (index !== -1) values.splice(index, 1);
      }
    },
    query: (table: string) => {
      const predicates: Predicate[] = [];
      let orderFields = ["_creationTime", "_id"];
      let direction = 1;
      const selected = () => rows(table).filter((row) => predicates.every((predicate) => predicate(row))).sort((a, b) => {
        for (const key of orderFields) {
          if (a[key] !== b[key]) return ((a[key] as never) < (b[key] as never) ? -1 : 1) * direction;
        }
        return 0;
      }).map((row) => structuredClone(row));
      const range = {
        eq: (key: string, value: unknown) => { predicates.push((row) => row[key] === value); return range; },
        gte: (key: string, value: number) => { predicates.push((row) => (row[key] as number) >= value); return range; },
        lte: (key: string, value: number) => { predicates.push((row) => (row[key] as number) <= value); return range; },
      };
      const query = {
        withIndex: (name: string, select?: (q: typeof range) => unknown) => {
          select?.(range);
          if (name === "by_slug_created") orderFields = ["createdAt", "source_created", "changelog_id"];
          if (name === "by_reviewer") orderFields = ["source_created", "article_id"];
          if (name === "by_created_at") orderFields = ["createdAt", "_creationTime", "_id"];
          return query;
        },
        filter: (select: (q: typeof expressions) => Predicate) => { predicates.push(select(expressions)); return query; },
        order: (value: string) => { direction = value === "desc" ? -1 : 1; return query; },
        collect: async () => selected(),
        take: async (n: number) => selected().slice(0, n),
        first: async () => selected()[0] ?? null,
        unique: async () => selected()[0] ?? null,
        paginate: async ({ cursor, numItems }: { cursor: string | null; numItems: number }) => {
          const start = Number(cursor ?? 0);
          const all = selected();
          return { page: all.slice(start, start + numItems), continueCursor: String(start + numItems), isDone: start + numItems >= all.length };
        },
        async *[Symbol.asyncIterator]() { yield* selected(); },
      };
      return query;
    },
  };
  const ctx = { db, storage: { getUrl: async () => null } } as unknown as MutationCtx;
  return { ctx, indexed: withPublicReadIndexes(ctx), rows, fail: (table: string) => { failingTable = table; },
    scoped: (context: MutationCtx, name: string) => (context.db as unknown as typeof db).table(name) };
}

const work = (slug: string) => ({ slug, title: "Ketamine", type: "image", artist: "Artist", format: "jpg", created_at: "2026-01-01", url: `https://example.test/${slug}.jpg` });
const entry = (slug: string, date: string) => ({ entryId: slug, createdAt: date, message: slug, markdown: "", submittedBy: null, articles: [{ id: 1, title: "Ketamine", slug: "ketamine" }] });

async function ready(ctx: MutationCtx, name: "gallery" | "history" | "reviews" | "tripReports") {
  let cursor: string | undefined;
  while (true) {
    const result = await backfillPublicReadIndexPage(ctx, { name, cursor, limit: 1 });
    if (result.isDone) return;
    cursor = result.cursor;
  }
}

describe("maintained public read indexes", () => {
  it("updates membership without reordering unchanged works, and removes replaced/deleted associations", async () => {
    const { ctx, indexed, rows } = database();
    await ctx.db.insert("substanceIndex", { slug: "ketamine", title: "Ketamine" } as never);
    const first = await indexed.db.insert("replications", work("first") as never);
    const second = await indexed.db.insert("replications", work("second") as never);
    await ready(ctx, "gallery");
    await indexed.db.patch("replications", first, { title: "Ketamine still" });
    const gallery = await getPublicGalleryBySubstanceHandler(ctx, { substance_slug: "ketamine" });
    expect(gallery.items.map((item) => item.replication.slug)).toEqual(["first", "second"]);
    await indexed.db.replace(second, { ...work("renamed"), title: "No drug" } as never);
    expect(rows("replicationGalleryCandidates").filter((row) => row.replication_id === second).map((row) => row.candidate_key)).toEqual(["slug:renamed"]);
    await indexed.db.delete("replications", first);
    expect((await getPublicGalleryBySubstanceHandler(ctx, { substance_slug: "ketamine" })).items).toEqual([]);
  });

  it("maintains ready public galleries through table-scoped writes", async () => {
    const { ctx, indexed, scoped } = database();
    await ctx.db.insert("substanceIndex", { slug: "ketamine", title: "Ketamine" } as never);
    await ready(ctx, "gallery");
    const table = scoped(indexed, "replications");
    const id = await table.insert(work("scoped"));
    const slugs = async () => (await getPublicGalleryBySubstanceHandler(ctx, { substance_slug: "ketamine" })).items.map((item) => item.replication.slug);
    expect(await slugs()).toEqual(["scoped"]);
    expect((await table.get(id))?.slug).toBe("scoped");
    await table.patch(id, { publication_state: "duplicate-suppressed" });
    expect(await slugs()).toEqual([]);
    await table.replace(id, work("restored"));
    expect(await slugs()).toEqual(["restored"]);
    await table.delete(id);
    expect(await slugs()).toEqual([]);
  });

  it("preserves article history ordering and exact membership across patches and deletion", async () => {
    const { ctx, indexed } = database();
    const older = await indexed.db.insert("changelog", entry("older", "2026-01-01") as never);
    const newer = await indexed.db.insert("changelog", entry("newer", "2026-02-01") as never);
    await ready(ctx, "history");
    // Postgres keeps the handler at runtime but omits it from its public type.
    const registeredQuery = getByArticleSlug as unknown as { _handler: (ctx: MutationCtx, args: { slug: string }) => Promise<Array<{ entryId: string }>> };
    const read = registeredQuery._handler;
    expect((await read(ctx, { slug: "ketamine" })).map((row) => row.entryId)).toEqual(["newer", "older"]);
    await indexed.db.patch(older, { createdAt: "2026-03-01" });
    expect((await read(ctx, { slug: "ketamine" })).map((row) => row.entryId)).toEqual(["older", "newer"]);
    await indexed.db.patch(newer, { articles: [] });
    await indexed.db.delete(older);
    expect(await read(ctx, { slug: "ketamine" })).toEqual([]);
  });

  it("merges reviewer aliases into complete pages and removes revoked reviews", async () => {
    const { ctx, indexed } = database();
    await ctx.db.insert("contributorProfiles", { key: "LYREA", aliases: ["oldhandle"], membershipEmail: "lyrea@example.test" } as never);
    const article = (slug: string, email: string) => ({ slug, title: slug, editorial_review: { status: "completed", reviewed_by: email, reviewed_at: "2026-01-01" } });
    const first = await indexed.db.insert("substanceIndex", article("first", " OLDHANDLE@LOCAL.DOSE.WIKI ") as never);
    await indexed.db.insert("substanceIndex", article("second", "lyrea@example.test") as never);
    await ready(ctx, "reviews");
    const page = await getPublicReviewedArticlesPageHandler(ctx, { profileKey: "LYREA", numItems: 1 });
    const next = await getPublicReviewedArticlesPageHandler(ctx, { profileKey: "LYREA", numItems: 1, cursor: page.cursor });
    expect([...page.items, ...next.items].map((row) => row.slug)).toEqual(["first", "second"]);
    expect(page.isDone).toBe(false);
    expect(next.isDone).toBe(true);
    await indexed.db.patch(first, { editorial_review: { status: "in_progress" } } as never);
    const remaining = await getPublicReviewedArticlesPageHandler(ctx, { profileKey: "LYREA", numItems: 10 });
    expect(remaining.items.map((row) => row.slug)).toEqual(["second"]);
    expect(JSON.stringify(remaining.items)).not.toContain("@");
  });

  it("cannot certify a partial pass, skip a cursor or confuse empty membership with incomplete indexing", async () => {
    const { ctx, indexed } = database();
    await indexed.db.insert("tripReports", { substances: [] } as never);
    await indexed.db.insert("tripReports", { substances: [{ name: "LSD" }] } as never);
    expect(await publicReadIndexReady(ctx, "tripReports")).toBe(false);
    const first = await backfillPublicReadIndexPage(ctx, { name: "tripReports", limit: 1 });
    expect(await publicReadIndexReady(ctx, "tripReports")).toBe(false);
    await expect(backfillPublicReadIndexPage(ctx, { name: "tripReports", cursor: "skip", limit: 1 })).rejects.toMatchObject({ data: { code: "PUBLIC_READ_INDEX_CURSOR_MISMATCH" } });
    await backfillPublicReadIndexPage(ctx, { name: "tripReports", cursor: first.cursor, limit: 1 });
    expect(await publicReadIndexReady(ctx, "tripReports")).toBe(true);
  });

  it("rejects the enclosing mutation even if a bulk handler catches a derived-write failure", async () => {
    const { ctx, fail } = database();
    fail("replicationGalleryCandidates");
    const registered = mutation({ args: {}, handler: async (context) => {
      try { await context.db.insert("replications", work("failure") as never); } catch { /* bulk row catch */ }
      return "incorrect success";
    } });
    // Exercise the registration boundary, not just the imported helper.
    const registeredMutation = registered as unknown as { _handler: (ctx: MutationCtx, args: object) => Promise<unknown> };
    await expect(registeredMutation._handler(ctx, {})).rejects.toThrow("Injected index failure");
  });

  it("rejects swallowed derived failures from table-scoped writes", async () => {
    const { ctx, fail, scoped } = database();
    fail("replicationGalleryCandidates");
    const registered = mutation({ args: {}, handler: async (context) => {
      try { await scoped(context, "replications").insert(work("failure")); } catch { /* bulk row catch */ }
      return "incorrect success";
    } });
    const registeredMutation = registered as unknown as { _handler: (ctx: MutationCtx, args: object) => Promise<unknown> };
    await expect(registeredMutation._handler(ctx, {})).rejects.toThrow("Injected index failure");
  });
});

describe("durable public cache publication boundary", () => {
  const invoke = (fn: unknown, ctx: MutationCtx, args: object = {}) => {
    // Postgres exposes this test seam at runtime but omits it from its builder type.
    const registered = fn as { _handler: (ctx: MutationCtx, args: object) => Promise<unknown> };
    return registered._handler(ctx, args);
  };

  it("does not let an old delivery acknowledge a commit made after its claim", async () => {
    const { ctx, rows } = database();
    const create = mutation({ args: {}, handler: (context) =>
      context.db.insert("copyBlocks", { key: "intro", kind: "plain", text: "First" } as never) });
    const id = await invoke(create, ctx) as never;
    const claimed = await invoke(claimDue, ctx) as Row[];
    expect(claimed).toHaveLength(1);
    const edit = mutation({ args: {}, handler: (context) => context.db.patch(id, { text: "Second" } as never) });
    await invoke(edit, ctx);
    await invoke(recordDelivery, ctx, { id: claimed[0]._id, generation: claimed[0].generation, complete: true, receipts: [] });
    expect(rows("publicCachePublications")[0]).toMatchObject({ pending: true, generation: 2 });
    const recovered = await invoke(claimDue, ctx) as Row[];
    expect(recovered[0].generation).toBe(2);
    await invoke(recordDelivery, ctx, { id: recovered[0]._id, generation: 2, complete: true, receipts: [] });
    expect(await invoke(claimDue, ctx)).toEqual([]);
  });

  it("recovers a claimed notification after an action dies without acknowledging it", async () => {
    const { ctx } = database();
    await invoke(mutation({ args: {}, handler: (context) =>
      context.db.insert("copyBlocks", { key: "intro", kind: "plain", text: "First" } as never) }), ctx);
    const [claim] = await invoke(claimDue, ctx) as Row[];
    expect(await invoke(claimDue, ctx)).toEqual([]);
    await ctx.db.patch(claim._id as never, { nextAttemptAt: Date.now() - 1 } as never);
    const [retry] = await invoke(claimDue, ctx) as Row[];
    expect(retry).toMatchObject({ _id: claim._id, generation: claim.generation, pending: true });
  });

  it("rejects the enclosing source mutation if its durable notification cannot commit", async () => {
    const { ctx, rows, fail } = database();
    fail("publicCachePublications");
    const create = mutation({ args: {}, handler: (context) =>
      context.db.insert("copyBlocks", { key: "intro", kind: "plain", text: "First" } as never) });
    // Postgres rolls back a rejected mutation transaction; never swallow an outbox
    // error and allow the source-only commit to escape that transaction boundary.
    await expect(invoke(create, ctx)).rejects.toThrow("Injected index failure");
    expect(rows("publicCachePublications")).toEqual([]);
  });

  it("does not queue unchanged source writes or writes which throw before commit", async () => {
    const { ctx, rows } = database();
    const id = await ctx.db.insert("copyBlocks", { key: "intro", kind: "plain", text: "First" } as never);
    await invoke(mutation({ args: {}, handler: (context) => context.db.patch(id, { text: "First" } as never) }), ctx);
    expect(rows("publicCachePublications")).toEqual([]);
    await expect(invoke(mutation({ args: {}, handler: async (context) => {
      await context.db.patch(id, { text: "Second" } as never);
      throw new Error("reject publication");
    } }), ctx)).rejects.toThrow("reject publication");
    expect(rows("publicCachePublications")).toEqual([]);
  });
});
