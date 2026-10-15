import "server-only";
import type { SqlExecutor } from "../postgres/runtime/db";
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
  retranslated_at: number | null;
  retranslation_requested_at?: number | null;
  updated_at: number;
};

export type Glossary = Readonly<Record<string, string>>;

export type GlossaryDraft = Pick<TranslationGlossaryRow, "term" | "target" | "kind">;

export type GlossaryLocaleSummary = { locale: string; draft: number; approved: number };

const ROW_COLUMNS = '"locale", "term", "target", "kind", "status", "source", "reviewed_at", "reviewed_by", "retranslated_at", "retranslation_requested_at", "updated_at"';

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
      retranslation_requested_at: row.retranslation_requested_at == null ? null : Number(row.retranslation_requested_at),
      updated_at: Number(row.updated_at),
    }))
    .sort((a, b) => a.term.localeCompare(b.term));
}

export function pendingRetranslation(rows: readonly TranslationGlossaryRow[]): string[] {
  return rows
    .filter((row) => row.status === "approved" && (row.reviewed_at ?? 0) > (row.retranslation_requested_at ?? 0))
    .map((row) => row.term);
}

export async function markRetranslationRequested(locale: string, terms: readonly string[] | undefined, requestedThrough: number): Promise<number> {
  assertDataWritesNotFrozen("markRetranslationRequested");
  if (terms?.length === 0) return 0;
  const updated = await getPostgresClient().sql<{ term: string }>(
    `UPDATE "translationGlossary" SET "retranslation_requested_at" = $2
     WHERE "locale" = $1 AND "status" = 'approved' AND "reviewed_at" < $2
     ${terms === undefined ? "" : 'AND "term" = ANY($3::text[])'} RETURNING "term"`,
    terms === undefined ? [locale, requestedThrough] : [locale, requestedThrough, [...terms]],
  );
  return updated.length;
}

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

export async function loadGlossary(locale: string, options: { status?: GlossaryStatus } = {}): Promise<Glossary> {
  const rows = await readGlossaryRows(locale, { status: options.status ?? "approved" });
  return Object.freeze(Object.fromEntries(rows.map((row) => [row.term, row.target])));
}

export function glossaryDigestInput(glossary: Glossary): string {
  return JSON.stringify(Object.entries(glossary).sort(([a], [b]) => a.localeCompare(b)));
}

export async function glossaryLocales(allowedLocales?: readonly string[]): Promise<GlossaryLocaleSummary[]> {
  if (allowedLocales?.length === 0) return [];
  const constrained = allowedLocales !== undefined;
  const rows = await getPostgresClient().sql<{ locale: string; draft: string; approved: string }>(
    `SELECT g."locale",
            COUNT(*) FILTER (WHERE g."status" = 'draft' OR COALESCE(r."draft", 'null'::jsonb) <> 'null'::jsonb)::text AS draft,
            COUNT(*) FILTER (WHERE g."status" = 'approved' AND COALESCE(r."draft", 'null'::jsonb) = 'null'::jsonb)::text AS approved
     FROM "translationGlossary" g
     LEFT JOIN "translationReviewEntries" r ON r."locale" = g."locale" AND r."scope" = 'glossary' AND r."source_id" = g."term"
     ${constrained ? 'WHERE g."locale" = ANY($1::text[])' : ""}
     GROUP BY g."locale" ORDER BY g."locale"`,
    constrained ? [[...allowedLocales]] : [],
  );
  return rows.map((row) => ({ locale: row.locale, draft: Number(row.draft), approved: Number(row.approved) }));
}

export type GlossaryCollision = { kind: string; target: string; terms: string[] };

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

function collisionKey(kind: string, target: string): string {
  return `${kind}\u0000${target.trim().toLowerCase()}`;
}

function lexeme(term: string): string {
  const lower = term.trim().toLowerCase();
  if (lower.endsWith("ies") && lower.length > 4) return `${lower.slice(0, -3)}y`;
  if (lower.endsWith("es") && lower.length > 3) return lower.slice(0, -2);
  if (lower.endsWith("s") && !lower.endsWith("ss") && lower.length > 2) return lower.slice(0, -1);
  return lower;
}

async function inspectGlossaryCollisions(locale: string, candidates: readonly GlossaryDraft[], tx?: Pick<SqlExecutor, "query">): Promise<{ collisions: GlossaryCollision[]; collisionConfirmation: string }> {
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

  const query = `SELECT "term", "target", "kind" FROM "translationGlossary"
     WHERE "locale" = $1 AND "status" = 'approved' AND "kind" = ANY($2::text[])`;
  const parameters = [locale, [...new Set([...byTerm.values()].map((candidate) => candidate.kind))]];
  const approved = tx
    ? (await tx.query(query, parameters)).rows as { term: string; target: string; kind: string }[]
    : await getPostgresClient().sql<{ term: string; target: string; kind: string }>(query, parameters);
  for (const row of approved) {
    if (byTerm.has(row.term)) continue;
    const group = groups.get(collisionKey(row.kind, row.target));
    group?.terms.add(row.term);
    group?.renderings.set(row.term, row.target);
  }

  const shared = [...groups.values()].filter((group) => new Set([...group.terms].map(lexeme)).size > 1);
  const collisions = shared.map((group) => ({ kind: group.kind, target: group.target, terms: [...group.terms].sort((a, b) => a.localeCompare(b)) }));
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

export async function assertNoCollisions(locale: string, candidates: readonly GlossaryDraft[], confirmation?: string, tx?: Pick<SqlExecutor, "query">): Promise<void> {
  const inspected = await inspectGlossaryCollisions(locale, candidates, tx);
  if (inspected.collisions.length > 0 && confirmation !== inspected.collisionConfirmation) {
    throw new GlossaryCollisionError(inspected.collisions, inspected.collisionConfirmation);
  }
}

export async function upsertGlossaryRows(
  locale: string,
  rows: readonly GlossaryDraft[],
  by: { status: "draft"; source: "model" },
): Promise<number> {
  if (rows.length === 0) return 0;
  assertDataWritesNotFrozen("upsertGlossaryRows");
  if (by.source !== "model" || by.status !== "draft") throw new Error("Human glossary changes must use explicit translation review.");
  const written = await getPostgresClient().sql<{ term: string }>(
    `INSERT INTO "translationGlossary" ("locale", "term", "target", "kind", "status", "source", "reviewed_at", "reviewed_by", "updated_at")
     SELECT $1, t, g, k, 'draft', 'model', NULL, NULL, $5 FROM UNNEST($2::text[], $3::text[], $4::text[]) AS draft(t, g, k)
     ON CONFLICT ("locale", "term") DO NOTHING
     RETURNING "term"`,
    [locale, rows.map((row) => row.term), rows.map((row) => row.target), rows.map((row) => row.kind), Date.now()],
  );
  return written.length;
}
