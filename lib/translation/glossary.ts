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
import { createHash } from "node:crypto";

import { getPostgresClient } from "@server/postgres/runtime/backend";
import { assertDataWritesNotFrozen } from "../runtime/dataWriteFreeze";

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
  /** When this rendering last reached stored segments; see schema.runtime.ts. */
  retranslated_at: number | null;
  updated_at: number;
};

/** `term -> target`, the shape the engine injects into prompts and the validator checks against. */
export type Glossary = Readonly<Record<string, string>>;

/** The row fields a drafter supplies; status and source say who wrote it. */
export type GlossaryDraft = Pick<TranslationGlossaryRow, "term" | "target" | "kind">;

export type GlossaryLocaleSummary = { locale: string; draft: number; approved: number };

const ROW_COLUMNS = '"locale", "term", "target", "kind", "status", "source", "reviewed_at", "reviewed_by", "retranslated_at", "updated_at"';

/** Every row for one locale (optionally one status), sorted by term the way the digest sorts them. */
export async function readGlossaryRows(locale: string, options: { status?: GlossaryStatus } = {}): Promise<TranslationGlossaryRow[]> {
  const rows = options.status
    ? await getPostgresClient().sql<TranslationGlossaryRow>(
      `SELECT ${ROW_COLUMNS} FROM "translationGlossary" WHERE "locale" = $1 AND "status" = $2`,
      [locale, options.status],
    )
    : await getPostgresClient().sql<TranslationGlossaryRow>(`SELECT ${ROW_COLUMNS} FROM "translationGlossary" WHERE "locale" = $1`, [locale]);
  return rows
    .map((row) => ({
      ...row,
      reviewed_at: row.reviewed_at === null ? null : Number(row.reviewed_at),
      retranslated_at: row.retranslated_at === null || row.retranslated_at === undefined ? null : Number(row.retranslated_at),
      updated_at: Number(row.updated_at),
    }))
    .sort((a, b) => a.term.localeCompare(b.term));
}

/**
 * The approved terms whose rendering changed after it last reached stored
 * segments: what a scoped retranslate should send. Derived from the rows so
 * it is the same list on every machine and after every reload.
 */
export function pendingRetranslation(rows: readonly TranslationGlossaryRow[]): string[] {
  return rows
    .filter((row) => row.status === "approved" && (row.reviewed_at ?? 0) > (row.retranslated_at ?? 0))
    .map((row) => row.term);
}

/**
 * Record that these approved renderings reached the segments now. `terms`
 * scopes the stamp to one retranslate; omit it after the locale's main
 * translation, which carries every approved term.
 */
export async function markRetranslated(locale: string, terms?: readonly string[]): Promise<number> {
  assertDataWritesNotFrozen("markRetranslated");
  const now = Date.now();
  if (terms === undefined) {
    const updated = await getPostgresClient().sql<{ term: string }>(
      `UPDATE "translationGlossary" SET "retranslated_at" = $2 WHERE "locale" = $1 AND "status" = 'approved' RETURNING "term"`,
      [locale, now],
    );
    return updated.length;
  }
  if (terms.length === 0) return 0;
  const updated = await getPostgresClient().sql<{ term: string }>(
    `UPDATE "translationGlossary" SET "retranslated_at" = $2 WHERE "locale" = $1 AND "status" = 'approved' AND "term" = ANY($3::text[]) RETURNING "term"`,
    [locale, now, [...terms]],
  );
  return updated.length;
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

/** Draft and approved counts for the requested locales that have rows. */
export async function glossaryLocales(allowedLocales?: readonly string[]): Promise<GlossaryLocaleSummary[]> {
  if (allowedLocales?.length === 0) return [];
  const constrained = allowedLocales !== undefined;
  const rows = await getPostgresClient().sql<{ locale: string; draft: string; approved: string }>(
    `SELECT "locale",
            COUNT(*) FILTER (WHERE "status" = 'draft')::text AS draft,
            COUNT(*) FILTER (WHERE "status" = 'approved')::text AS approved
     FROM "translationGlossary"
     ${constrained ? 'WHERE "locale" = ANY($1::text[])' : ""}
     GROUP BY "locale" ORDER BY "locale"`,
    constrained ? [[...allowedLocales]] : [],
  );
  return rows.map((row) => ({ locale: row.locale, draft: Number(row.draft), approved: Number(row.approved) }));
}

/** Terms of one kind whose renderings would read the same. */
export type GlossaryCollision = { kind: string; target: string; terms: string[] };

/**
 * An approved write refused because two terms of one kind would share a
 * rendering. Drafts may hold one, but an approved write needs an explicit
 * reviewer acknowledgement of the current collision set.
 */
export class GlossaryCollisionError extends Error {
  collisions: GlossaryCollision[];

  constructor(collisions: GlossaryCollision[], readonly collisionConfirmation?: string) {
    super(
      collisions
        .map((c) => `${c.terms.length === 2 ? "Two" : String(c.terms.length)} terms in ${c.kind} would share the rendering ${c.target}: ${c.terms.join(", ")}`)
        .join(" "),
    );
    this.name = "GlossaryCollisionError";
    this.collisions = collisions;
  }
}

/** The key two renderings collide on: same kind, same text once trimmed and case-folded. */
function collisionKey(kind: string, target: string): string {
  return `${kind}\u0000${target.trim().toLowerCase()}`;
}

/**
 * Two English terms that differ only by a regular plural are one lexeme:
 * the site lists both "Replicator" and "Replicators", and a language without
 * grammatical number renders them identically without losing a distinction.
 */
function lexeme(term: string): string {
  const lower = term.trim().toLowerCase();
  if (lower.endsWith("ies") && lower.length > 4) return `${lower.slice(0, -3)}y`;
  if (lower.endsWith("es") && lower.length > 3) return lower.slice(0, -2);
  if (lower.endsWith("s") && !lower.endsWith("ss") && lower.length > 2) return lower.slice(0, -1);
  return lower;
}

/**
 * Which candidates would, once approved, read the same as another candidate
 * or an approved row of the same kind in this locale. A candidate that
 * replaces its own approved row is compared against everything but that row.
 * Candidates with an empty rendering are ignored, and terms that are one
 * lexeme (singular and plural) never collide with each other.
 */
async function inspectGlossaryCollisions(locale: string, candidates: readonly GlossaryDraft[]): Promise<{ collisions: GlossaryCollision[]; collisionConfirmation: string }> {
  const byTerm = new Map<string, GlossaryDraft>();
  for (const candidate of candidates) {
    if (candidate.target.trim() !== "") byTerm.set(candidate.term, candidate);
  }
  if (byTerm.size === 0) return { collisions: [], collisionConfirmation: "" };

  const groups = new Map<string, { kind: string; target: string; terms: Set<string>; renderings: Map<string, string> }>();
  for (const candidate of byTerm.values()) {
    const key = collisionKey(candidate.kind, candidate.target);
    const group = groups.get(key) ?? { kind: candidate.kind, target: candidate.target.trim(), terms: new Set<string>(), renderings: new Map<string, string>() };
    group.terms.add(candidate.term);
    group.renderings.set(candidate.term, candidate.target);
    groups.set(key, group);
  }

  const approved = await getPostgresClient().sql<{ term: string; target: string; kind: string }>(
    `SELECT "term", "target", "kind" FROM "translationGlossary"
     WHERE "locale" = $1 AND "status" = 'approved' AND "kind" = ANY($2::text[])`,
    [locale, [...new Set([...byTerm.values()].map((candidate) => candidate.kind))]],
  );
  for (const row of approved) {
    if (byTerm.has(row.term)) continue;
    const group = groups.get(collisionKey(row.kind, row.target));
    group?.terms.add(row.term);
    group?.renderings.set(row.term, row.target);
  }

  const shared = [...groups.values()].filter((group) => new Set([...group.terms].map(lexeme)).size > 1);
  const collisions = shared.map((group) => ({ kind: group.kind, target: group.target, terms: [...group.terms].sort((a, b) => a.localeCompare(b)) }));
  // Bind the acknowledgement to the locale and every exact English/target pair,
  // not just the case-folded rendering used to discover a collision.
  const identities = shared.map((group) => JSON.stringify([
    group.kind,
    [...group.renderings].sort(([a], [b]) => a.localeCompare(b)),
  ])).sort();
  const collisionConfirmation = createHash("sha256").update(JSON.stringify([locale, identities])).digest("hex");
  return { collisions, collisionConfirmation };
}

export async function findGlossaryCollisions(locale: string, candidates: readonly GlossaryDraft[]): Promise<GlossaryCollision[]> {
  return (await inspectGlossaryCollisions(locale, candidates)).collisions;
}

async function assertNoCollisions(locale: string, candidates: readonly GlossaryDraft[], confirmation?: string): Promise<void> {
  const inspected = await inspectGlossaryCollisions(locale, candidates);
  if (inspected.collisions.length > 0 && confirmation !== inspected.collisionConfirmation) {
    throw new GlossaryCollisionError(inspected.collisions, inspected.collisionConfirmation);
  }
}

/**
 * Insert or replace rows. A row already approved is never overwritten by a
 * draft: the reviewer's decision outlives every redraft. A human write (a
 * reviewer editing or importing a reviewed list) replaces whatever is there.
 * An approved write is refused whole (GlossaryCollisionError) when two of
 * its rows, or a row and an approved one it does not replace, would share a
 * rendering within a kind, unless a human reviewer acknowledges the exact
 * current collision set; drafts are never held to that.
 */
export async function upsertGlossaryRows(
  locale: string,
  rows: readonly GlossaryDraft[],
  by: { status: GlossaryStatus; source: GlossarySource; reviewedBy?: string; collisionConfirmation?: string },
): Promise<number> {
  if (rows.length === 0) return 0;
  assertDataWritesNotFrozen("upsertGlossaryRows");
  const reviewed = by.status === "approved";
  if (reviewed) await assertNoCollisions(locale, rows, by.source === "human" && by.reviewedBy ? by.collisionConfirmation : undefined);
  const now = Date.now();
  const guard = by.source === "model" ? `WHERE "translationGlossary"."status" <> 'approved'` : "";
  const written = await getPostgresClient().sql<{ term: string }>(
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

/**
 * Mark rows approved as they stand; returns the terms that changed status.
 * Throws GlossaryCollisionError, writing nothing, when the rows as drafted
 * would share a rendering with each other or with an approved row of the
 * same kind, unless the reviewer acknowledges the exact current collision set.
 */
export async function approveGlossaryTerms(locale: string, terms: readonly string[], reviewedBy: string, collisionConfirmation?: string): Promise<string[]> {
  if (terms.length === 0) return [];
  assertDataWritesNotFrozen("approveGlossaryTerms");
  const pending = await getPostgresClient().sql<GlossaryDraft>(
    `SELECT "term", "target", "kind" FROM "translationGlossary"
     WHERE "locale" = $1 AND "term" = ANY($2::text[]) AND "status" <> 'approved'`,
    [locale, [...terms]],
  );
  if (pending.length === 0) return [];
  await assertNoCollisions(locale, pending, reviewedBy ? collisionConfirmation : undefined);
  const now = Date.now();
  const rows = await getPostgresClient().sql<{ term: string }>(
    `UPDATE "translationGlossary" SET "status" = 'approved', "reviewed_at" = $3, "reviewed_by" = $4, "updated_at" = $3
     WHERE "locale" = $1 AND "term" = ANY($2::text[]) AND "status" <> 'approved'
     RETURNING "term"`,
    [locale, pending.map((row) => row.term), now, reviewedBy],
  );
  return rows.map((row) => row.term);
}

/**
 * A reviewer's rendering: approved on write, since writing it is the review.
 * Null when the locale has no row for the term. Throws GlossaryCollisionError,
 * writing nothing, when the rendering is already an approved rendering of
 * another term of the same kind without its current collision acknowledgement.
 */
export async function editGlossaryTerm(locale: string, term: string, target: string, reviewedBy: string, collisionConfirmation?: string): Promise<TranslationGlossaryRow | null> {
  assertDataWritesNotFrozen("editGlossaryTerm");
  const [current] = await getPostgresClient().sql<{ kind: string }>(
    `SELECT "kind" FROM "translationGlossary" WHERE "locale" = $1 AND "term" = $2`,
    [locale, term],
  );
  if (!current) return null;
  await assertNoCollisions(locale, [{ term, target, kind: current.kind }], reviewedBy ? collisionConfirmation : undefined);
  const now = Date.now();
  const [row] = await getPostgresClient().sql<TranslationGlossaryRow>(
    `UPDATE "translationGlossary"
     SET "target" = $3, "status" = 'approved', "source" = 'human', "reviewed_at" = $4, "reviewed_by" = $5, "updated_at" = $4
     WHERE "locale" = $1 AND "term" = $2
     RETURNING ${ROW_COLUMNS}`,
    [locale, term, target, now, reviewedBy],
  );
  return row ? { ...row, reviewed_at: Number(row.reviewed_at), updated_at: Number(row.updated_at) } : null;
}
