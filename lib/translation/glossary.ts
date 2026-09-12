/**
 * The translation glossary: the reviewed term list every prompt for a locale
 * is held to. It lives in Postgres (`translationGlossary`, migration 0008)
 * so a reviewer can edit one gloss in the Glossary tab and have only the
 * segments that mention it retranslated, instead of editing a committed
 * JSON file and replaying the whole store.
 *
 * Only approved rows reach a prompt. The digest the store stamps on every
 * segment (`promptVersionFor` in liveTranslation.ts) covers the approved set
 * and nothing else, so a draft row is invisible to the mirror until a human
 * approves it. Rows are drafted by the model (`build-glossary.mjs --locale`,
 * or the tab's "Draft missing terms") or written by a reviewer.
 */
import "server-only";

import { getDataBackend, getPostgresConvexClient } from "@server/postgres/runtime/backend";

export type GlossaryStatus = "draft" | "approved";
export type GlossarySource = "model" | "human";

export type TranslationGlossaryRow = {
  locale: string;
  term: string;
  target: string;
  kind: string;
  status: GlossaryStatus;
  source: GlossarySource;
  reviewed_at: number | null;
  reviewed_by: string | null;
  updated_at: number;
};

/** `term -> target`, the shape the engine injects into prompts and the validator checks against. */
export type Glossary = Readonly<Record<string, string>>;

/** The row fields a drafter supplies; status and source say who wrote it. */
export type GlossaryDraft = Pick<TranslationGlossaryRow, "term" | "target" | "kind">;

export type GlossaryLocaleSummary = { locale: string; draft: number; approved: number };

function db() {
  if (getDataBackend() !== "postgres") {
    throw new Error("The translation glossary lives in Postgres; run with DATA_BACKEND=postgres");
  }
  return getPostgresConvexClient();
}

const ROW_COLUMNS = '"locale", "term", "target", "kind", "status", "source", "reviewed_at", "reviewed_by", "updated_at"';

/** Every row for one locale (optionally one status), sorted by term the way the digest sorts them. */
export async function readGlossaryRows(locale: string, options: { status?: GlossaryStatus } = {}): Promise<TranslationGlossaryRow[]> {
  const rows = options.status
    ? await db().sql<TranslationGlossaryRow>(
      `SELECT ${ROW_COLUMNS} FROM "translationGlossary" WHERE "locale" = $1 AND "status" = $2`,
      [locale, options.status],
    )
    : await db().sql<TranslationGlossaryRow>(`SELECT ${ROW_COLUMNS} FROM "translationGlossary" WHERE "locale" = $1`, [locale]);
  return rows
    .map((row) => ({ ...row, reviewed_at: row.reviewed_at === null ? null : Number(row.reviewed_at), updated_at: Number(row.updated_at) }))
    .sort((a, b) => a.term.localeCompare(b.term));
}

/** The term map for one locale; approved rows only unless a status is named. */
export async function loadGlossary(locale: string, options: { status?: GlossaryStatus } = {}): Promise<Glossary> {
  const rows = await readGlossaryRows(locale, { status: options.status ?? "approved" });
  return Object.freeze(Object.fromEntries(rows.map((row) => [row.term, row.target])));
}

/**
 * The glossary's contribution to the prompt digest: the approved pairs sorted
 * by term, as JSON. `loadGlossary` returns approved rows only, so the map it
 * yields is exactly the set a prompt can inject; a draft row changes nothing
 * until it is approved.
 */
export function glossaryDigestInput(glossary: Glossary): string {
  return JSON.stringify(Object.entries(glossary).sort(([a], [b]) => a.localeCompare(b)));
}

/** Draft and approved counts for every locale that has a row. */
export async function glossaryLocales(): Promise<GlossaryLocaleSummary[]> {
  const rows = await db().sql<{ locale: string; draft: string; approved: string }>(
    `SELECT "locale",
            COUNT(*) FILTER (WHERE "status" = 'draft')::text AS draft,
            COUNT(*) FILTER (WHERE "status" = 'approved')::text AS approved
     FROM "translationGlossary" GROUP BY "locale" ORDER BY "locale"`,
  );
  return rows.map((row) => ({ locale: row.locale, draft: Number(row.draft), approved: Number(row.approved) }));
}

/**
 * Insert or replace rows. A row already approved is never overwritten by a
 * draft: the reviewer's decision outlives every redraft. A human write (a
 * reviewer editing or importing a reviewed list) replaces whatever is there.
 */
export async function upsertGlossaryRows(
  locale: string,
  rows: readonly GlossaryDraft[],
  by: { status: GlossaryStatus; source: GlossarySource; reviewedBy?: string },
): Promise<number> {
  if (rows.length === 0) return 0;
  const now = Date.now();
  const reviewed = by.status === "approved";
  const guard = by.source === "model" ? `WHERE "translationGlossary"."status" <> 'approved'` : "";
  const written = await db().sql<{ term: string }>(
    `INSERT INTO "translationGlossary" ("locale", "term", "target", "kind", "status", "source", "reviewed_at", "reviewed_by", "updated_at")
     SELECT $1, t, g, k, $5, $6, $7, $8, $9 FROM UNNEST($2::text[], $3::text[], $4::text[]) AS draft(t, g, k)
     ON CONFLICT ("locale", "term") DO UPDATE SET
       "target" = EXCLUDED."target", "kind" = EXCLUDED."kind", "status" = EXCLUDED."status", "source" = EXCLUDED."source",
       "reviewed_at" = EXCLUDED."reviewed_at", "reviewed_by" = EXCLUDED."reviewed_by", "updated_at" = EXCLUDED."updated_at"
     ${guard}
     RETURNING "term"`,
    [
      locale,
      rows.map((row) => row.term),
      rows.map((row) => row.target),
      rows.map((row) => row.kind),
      by.status,
      by.source,
      reviewed ? now : null,
      reviewed ? (by.reviewedBy ?? null) : null,
      now,
    ],
  );
  return written.length;
}

/** Mark rows approved as they stand; returns the terms that changed status. */
export async function approveGlossaryTerms(locale: string, terms: readonly string[], reviewedBy: string): Promise<string[]> {
  if (terms.length === 0) return [];
  const now = Date.now();
  const rows = await db().sql<{ term: string }>(
    `UPDATE "translationGlossary" SET "status" = 'approved', "reviewed_at" = $3, "reviewed_by" = $4, "updated_at" = $3
     WHERE "locale" = $1 AND "term" = ANY($2::text[]) AND "status" <> 'approved'
     RETURNING "term"`,
    [locale, [...terms], now, reviewedBy],
  );
  return rows.map((row) => row.term);
}

/** A reviewer's rendering: approved on write, since writing it is the review. */
export async function editGlossaryTerm(locale: string, term: string, target: string, reviewedBy: string): Promise<TranslationGlossaryRow | null> {
  const now = Date.now();
  const [row] = await db().sql<TranslationGlossaryRow>(
    `UPDATE "translationGlossary"
     SET "target" = $3, "status" = 'approved', "source" = 'human', "reviewed_at" = $4, "reviewed_by" = $5, "updated_at" = $4
     WHERE "locale" = $1 AND "term" = $2
     RETURNING ${ROW_COLUMNS}`,
    [locale, term, target, now, reviewedBy],
  );
  return row ? { ...row, reviewed_at: Number(row.reviewed_at), updated_at: Number(row.updated_at) } : null;
}
