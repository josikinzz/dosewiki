/**
 * Server-side paging for the reader feedback queues. Status and search
 * filters run in SQL, so every matching row is reachable however many newer
 * rows sit above it; pages follow a keyset cursor, so rows arriving or
 * changing between pages never shift or repeat the rows already loaded.
 */

import { losslessSelectList } from "../documentCodec";
import { fromRow, quote, type Doc, type SqlExecutor } from "./dbRows";

export type FeedbackQueueTable = "articleFeedback" | "siteFeedback";

/**
 * `oldest` puts the report that has waited longest first, the order for
 * working through unresolved rows. `importance` ranks critical first, then
 * oldest within a level; rows without a level sort last.
 */
export const FEEDBACK_QUEUE_ORDERS = ["oldest", "newest", "importance"] as const;
export type FeedbackQueueOrder = (typeof FEEDBACK_QUEUE_ORDERS)[number];

export const FEEDBACK_QUEUE_STATUSES = ["new", "reviewing", "resolved", "rejected", "spam"] as const;
export type FeedbackQueueStatusCounts = Record<(typeof FEEDBACK_QUEUE_STATUSES)[number], number>;

/** The status filter for New and Reviewing together: every item still waiting on a decision. */
export const FEEDBACK_QUEUE_UNRESOLVED = "unresolved";

export const FEEDBACK_QUEUE_MAX_PAGE = 250;

export type FeedbackQueuePageOptions = {
  status?: string;
  search?: string;
  order: FeedbackQueueOrder;
  cursor?: string | null;
  limit: number;
};

export class InvalidFeedbackQueueCursorError extends Error {
  constructor() {
    super("Invalid feedback queue cursor.");
    this.name = "InvalidFeedbackQueueCursorError";
  }
}

const SEARCH_COLUMNS: Record<FeedbackQueueTable, readonly string[]> = {
  articleFeedback: ["substance_title", "substance_slug", "category", "details", "source_url", "contact_email", "review_notes"],
  siteFeedback: ["category", "urgency", "details", "page", "email", "review_notes"],
};

const IMPORTANCE_COLUMN: Record<FeedbackQueueTable, string> = {
  articleFeedback: "importance",
  siteFeedback: "urgency",
};

type Cursor = { o: FeedbackQueueOrder; r?: number; c: string; t: number; i: string };

function importanceRank(table: FeedbackQueueTable): string {
  const column = quote(IMPORTANCE_COLUMN[table]);
  return `(CASE ${column} WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END)`;
}

/** The WHERE terms both the page and the counts share: search only; status is added by the page. */
function searchTerm(table: FeedbackQueueTable, search: string | undefined, params: unknown[]): string | null {
  const trimmed = search?.trim();
  if (!trimmed) return null;
  params.push(`%${trimmed.replace(/[\\%_]/g, (match) => `\\${match}`)}%`);
  const haystack = `concat_ws(' ', ${SEARCH_COLUMNS[table].map((column) => quote(column)).join(", ")})`;
  return `${haystack} ILIKE $${params.length} ESCAPE '\\'`;
}

export function encodeFeedbackQueueCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeFeedbackQueueCursor(value: string, order: FeedbackQueueOrder): Cursor {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new InvalidFeedbackQueueCursorError();
  }
  const cursor = decoded as Partial<Cursor> | null;
  if (
    !cursor || typeof cursor !== "object" || cursor.o !== order ||
    typeof cursor.c !== "string" || typeof cursor.i !== "string" ||
    typeof cursor.t !== "number" || !Number.isFinite(cursor.t) ||
    (order === "importance" && (typeof cursor.r !== "number" || !Number.isInteger(cursor.r)))
  ) {
    throw new InvalidFeedbackQueueCursorError();
  }
  return cursor as Cursor;
}

export async function readFeedbackQueuePage(
  client: SqlExecutor,
  table: FeedbackQueueTable,
  options: FeedbackQueuePageOptions,
): Promise<{ rows: Doc[]; nextCursor: string | null }> {
  const limit = Math.max(1, Math.min(Math.floor(options.limit), FEEDBACK_QUEUE_MAX_PAGE));
  const params: unknown[] = [];
  const where: string[] = [];
  if (options.status === FEEDBACK_QUEUE_UNRESOLVED) {
    where.push(`"status" COLLATE "C" IN ('new', 'reviewing')`);
  } else if (options.status) {
    params.push(options.status);
    where.push(`"status" COLLATE "C" = $${params.length}::text COLLATE "C"`);
  }
  const search = searchTerm(table, options.search, params);
  if (search) where.push(search);

  const rank = importanceRank(table);
  const keys = options.order === "importance"
    ? [rank, `"created_at" COLLATE "C"`, `"_creationTime"`, `"_id" COLLATE "C"`]
    : [`"created_at" COLLATE "C"`, `"_creationTime"`, `"_id" COLLATE "C"`];
  const direction = options.order === "newest" ? "DESC" : "ASC";

  if (options.cursor) {
    const cursor = decodeFeedbackQueueCursor(options.cursor, options.order);
    const values: string[] = [];
    if (options.order === "importance") {
      params.push(cursor.r);
      values.push(`$${params.length}::int`);
    }
    params.push(cursor.c, cursor.t, cursor.i);
    values.push(
      `$${params.length - 2}::text COLLATE "C"`,
      `$${params.length - 1}::float8`,
      `$${params.length}::text COLLATE "C"`,
    );
    where.push(`(${keys.join(", ")}) ${direction === "ASC" ? ">" : "<"} (${values.join(", ")})`);
  }

  params.push(limit + 1);
  const result = await client.query(
    `SELECT ${losslessSelectList(table)}, ${rank} AS "importanceRank"
     FROM ${quote(table)}
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY ${keys.map((key) => `${key} ${direction}`).join(", ")}
     LIMIT $${params.length}`,
    params,
  );

  const page = result.rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = result.rows.length > limit && last
    ? encodeFeedbackQueueCursor({
        o: options.order,
        ...(options.order === "importance" ? { r: Number(last.importanceRank) } : {}),
        c: String(last.created_at),
        t: Number(last._creationTime),
        i: String(last._id),
      })
    : null;
  return {
    rows: page.map((row) => {
      const { importanceRank: _rank, ...columns } = row;
      return fromRow(table, columns);
    }),
    nextCursor,
  };
}

/** Rows per status among those matching the search; the queue's filter counts and totals. */
export async function readFeedbackQueueCounts(
  client: SqlExecutor,
  table: FeedbackQueueTable,
  search: string | undefined,
): Promise<FeedbackQueueStatusCounts> {
  const params: unknown[] = [];
  const term = searchTerm(table, search, params);
  const result = await client.query(
    `SELECT "status", count(*)::int AS "count" FROM ${quote(table)} ${term ? `WHERE ${term}` : ""} GROUP BY "status"`,
    params,
  );
  const counts: FeedbackQueueStatusCounts = { new: 0, reviewing: 0, resolved: 0, rejected: 0, spam: 0 };
  for (const row of result.rows) {
    const status = row.status as keyof FeedbackQueueStatusCounts;
    if (status in counts) counts[status] = Number(row.count);
  }
  return counts;
}
