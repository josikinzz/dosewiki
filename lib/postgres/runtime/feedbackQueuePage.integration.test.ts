// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { SqlExecutor } from "./dbRows";
import {
  InvalidFeedbackQueueCursorError,
  readFeedbackQueueCounts,
  readFeedbackQueuePage,
  type FeedbackQueueOrder,
} from "./feedbackQueuePage";

let db: PGlite;
let client: SqlExecutor;

beforeAll(async () => {
  db = new PGlite();
  for (const file of readdirSync("lib/postgres/migrations").filter((name) => name.endsWith(".sql")).sort())
    await db.exec(readFileSync(`lib/postgres/migrations/${file}`, "utf8"));
  client = {
    statements: 0,
    query: async (sql, params = []) => {
      const result = await db.query<Record<string, unknown>>(sql, params);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    },
  };
}, 60_000);
beforeEach(async () => {
  await db.exec('TRUNCATE "articleFeedback", "siteFeedback"');
});
afterAll(async () => db?.close());

let sequence = 0;

async function seedArticle(row: {
  id: string;
  status: string;
  day: number;
  importance?: string;
  title?: string;
  details?: string;
}) {
  sequence += 1;
  const created = new Date(Date.UTC(2026, 0, 1) + row.day * 86_400_000).toISOString();
  await db.query(
    `INSERT INTO "articleFeedback" ("_id", "_creationTime", "id", "status", "schema_version", "substance_slug",
       "substance_title", "category", "importance", "details", "honeypot_triggered", "created_at", "updated_at")
     VALUES ($1, $2, $3, $4, 1, 'mescaline', $5, 'inaccurate', $6, $7, false, $8, $8)`,
    [
      `id${String(sequence).padStart(30, "0")}`,
      sequence,
      row.id,
      row.status,
      row.title ?? "Mescaline",
      row.importance ?? "normal",
      row.details ?? "Duration looks off.",
      created,
    ],
  );
}

async function allPages(options: { status?: string; search?: string; order: FeedbackQueueOrder; limit: number }) {
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 100; guard += 1) {
    const page = await readFeedbackQueuePage(client, "articleFeedback", { ...options, cursor });
    ids.push(...page.rows.map((row) => row.id as string));
    if (!page.nextCursor) return ids;
    cursor = page.nextCursor;
  }
  throw new Error("pagination did not terminate");
}

describe("feedback queue paging over isolated Postgres", () => {
  it("still reaches one old unresolved report under 250 newer resolved ones", async () => {
    await seedArticle({ id: "old-unresolved", status: "new", day: 0 });
    for (let index = 1; index <= 250; index += 1) {
      await seedArticle({ id: `resolved-${index}`, status: "resolved", day: index });
    }

    const pending = await readFeedbackQueuePage(client, "articleFeedback", { status: "new", order: "oldest", limit: 100 });
    expect(pending.rows.map((row) => row.id)).toEqual(["old-unresolved"]);
    expect(pending.nextCursor).toBeNull();

    const everything = await readFeedbackQueuePage(client, "articleFeedback", { order: "oldest", limit: 100 });
    expect(everything.rows[0].id).toBe("old-unresolved");

    const newestFirst = await allPages({ order: "newest", limit: 100 });
    expect(newestFirst).toHaveLength(251);
    expect(newestFirst[newestFirst.length - 1]).toBe("old-unresolved");

    expect(await readFeedbackQueueCounts(client, "articleFeedback", undefined)).toEqual({
      new: 1,
      reviewing: 0,
      resolved: 250,
      rejected: 0,
      spam: 0,
    });
  });

  it("pages every row exactly once, in a stable order, for each sort", async () => {
    for (let index = 0; index < 12; index += 1) {
      // Pairs share a timestamp so the cursor has to break ties.
      await seedArticle({
        id: `row-${index}`,
        status: "new",
        day: Math.floor(index / 2),
        importance: ["low", "critical", "normal", "high"][index % 4],
      });
    }

    for (const order of ["oldest", "newest", "importance"] as const) {
      const whole = (await readFeedbackQueuePage(client, "articleFeedback", { order, limit: 100 })).rows.map((row) => row.id);
      expect(await allPages({ order, limit: 5 })).toEqual(whole);
      expect(new Set(whole).size).toBe(12);
    }

    const byImportance = await allPages({ order: "importance", limit: 5 });
    expect(byImportance.slice(0, 3)).toEqual(["row-1", "row-5", "row-9"]);
    expect(byImportance.slice(-3)).toEqual(["row-0", "row-4", "row-8"]);
  });

  it("filters by search text in SQL, literally, and counts only the matches", async () => {
    await seedArticle({ id: "a", status: "new", day: 1, title: "Ketamine", details: "Dose is 100% wrong" });
    await seedArticle({ id: "b", status: "resolved", day: 2, title: "Ketamine", details: "Fixed" });
    await seedArticle({ id: "c", status: "new", day: 3, title: "LSD", details: "Typo" });

    const ketamine = await readFeedbackQueuePage(client, "articleFeedback", { search: "ketamine", order: "oldest", limit: 10 });
    expect(ketamine.rows.map((row) => row.id)).toEqual(["a", "b"]);
    expect(await readFeedbackQueueCounts(client, "articleFeedback", "ketamine")).toMatchObject({ new: 1, resolved: 1 });

    const percent = await readFeedbackQueuePage(client, "articleFeedback", { search: "100%", order: "oldest", limit: 10 });
    expect(percent.rows.map((row) => row.id)).toEqual(["a"]);
    const wildcard = await readFeedbackQueuePage(client, "articleFeedback", { search: "%", order: "oldest", limit: 10 });
    expect(wildcard.rows.map((row) => row.id)).toEqual(["a"]);
  });

  it("keeps a loaded page's successor stable when newer rows arrive", async () => {
    for (let index = 0; index < 4; index += 1) {
      await seedArticle({ id: `row-${index}`, status: "new", day: index });
    }
    const first = await readFeedbackQueuePage(client, "articleFeedback", { status: "new", order: "newest", limit: 2 });
    expect(first.rows.map((row) => row.id)).toEqual(["row-3", "row-2"]);

    await seedArticle({ id: "arrived", status: "new", day: 10 });
    const second = await readFeedbackQueuePage(client, "articleFeedback", {
      status: "new",
      order: "newest",
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(second.rows.map((row) => row.id)).toEqual(["row-1", "row-0"]);
  });

  it("refuses a cursor from another order or one that does not decode", async () => {
    await seedArticle({ id: "a", status: "new", day: 1 });
    await seedArticle({ id: "b", status: "new", day: 2 });
    const page = await readFeedbackQueuePage(client, "articleFeedback", { order: "oldest", limit: 1 });

    await expect(
      readFeedbackQueuePage(client, "articleFeedback", { order: "newest", limit: 1, cursor: page.nextCursor }),
    ).rejects.toBeInstanceOf(InvalidFeedbackQueueCursorError);
    await expect(
      readFeedbackQueuePage(client, "articleFeedback", { order: "oldest", limit: 1, cursor: "not a cursor" }),
    ).rejects.toBeInstanceOf(InvalidFeedbackQueueCursorError);
  });
});
