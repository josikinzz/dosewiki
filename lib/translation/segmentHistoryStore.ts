import "server-only";
import { getPostgresClient } from "@server/postgres/runtime/backend";
import type { TranslationSegmentChange, TranslationSegmentSnapshot } from "./segmentHistoryTypes";
import { TranslationReviewError } from "./reviewStore";

export function parseSegmentHistoryOptions(raw: { cursor?: string | null; hash?: string | null; limit?: string | number | null }) {
  const limit = raw.limit === null || raw.limit === undefined ? 50 : Number(raw.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TranslationReviewError("Choose a history page size from 1 to 100.");
  if (raw.cursor && (!/^[1-9]\d{0,18}$/.test(raw.cursor) || BigInt(raw.cursor) > 9223372036854775807n)) throw new TranslationReviewError("Invalid history cursor.");
  if (raw.hash && !/^[a-f0-9]{16}$/.test(raw.hash)) throw new TranslationReviewError("Invalid translation hash.");
  return { limit, cursor: raw.cursor || null, hash: raw.hash || null };
}
export async function readTranslationSegmentHistory(locale: string, raw: { cursor?: string | null; hash?: string | null; limit?: number } = {}): Promise<{ changes: TranslationSegmentChange[]; nextCursor: string | null }> {
  const { limit, cursor, hash } = parseSegmentHistoryOptions(raw);
  const rows = await getPostgresClient().sql<{ id: string; hash: string; before_state: TranslationSegmentSnapshot | null; after_state: TranslationSegmentSnapshot; created_at: number }>(
    `SELECT "id"::text, "hash", "before_state", "after_state", "created_at" FROM "translationSegmentHistory"
     WHERE "locale"=$1 AND ($2::bigint IS NULL OR "id" < $2::bigint) AND ($3::text IS NULL OR "hash"=$3)
     ORDER BY "id" DESC LIMIT $4`, [locale, cursor, hash, limit + 1]);
  const page = rows.slice(0, limit);
  return { changes: page.map((row) => ({ id: row.id, hash: row.hash, before: row.before_state, after: row.after_state, createdAt: Number(row.created_at), pages: [] })), nextCursor: rows.length > limit ? page[page.length - 1].id : null };
}
