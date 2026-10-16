import "server-only";

import { getPostgresClient } from "@server/postgres/runtime/backend";
import type { PublicDataReadAdapter } from "../data/publicData.reads";
import { collectGlossaryTerms, type GlossaryTerm } from "./glossaryDraft";
import { assertDataWritesNotFrozen } from "../runtime/dataWriteFreeze";

export type GlossaryGloss = {
  term: string;
  kind: string;
  gloss: string;
  updated_at: number;
  updated_by: string | null;
};

export const GLOSS_MAX_LENGTH = 240;

export class GlossaryGlossError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GlossaryGlossError";
  }
}

const ROW_COLUMNS = '"term", "kind", "gloss", "updated_at", "updated_by"';

export async function readGlosses(): Promise<GlossaryGloss[]> {
  const rows = await getPostgresClient().sql<GlossaryGloss>(`SELECT ${ROW_COLUMNS} FROM "translationGlossaryTerms"`);
  return rows
    .map((row) => ({ ...row, updated_at: Number(row.updated_at) }))
    .sort((a, b) => a.term.localeCompare(b.term));
}

export async function loadGlosses(): Promise<Readonly<Record<string, string>>> {
  return Object.fromEntries((await readGlosses()).map((row) => [row.term, row.gloss]));
}

export async function findGloss(term: string): Promise<GlossaryGloss | null> {
  const [row] = await getPostgresClient().sql<GlossaryGloss>(
    `SELECT ${ROW_COLUMNS} FROM "translationGlossaryTerms" WHERE LOWER("term") = LOWER($1) LIMIT 1`,
    [term.trim()],
  );
  return row ? { ...row, updated_at: Number(row.updated_at) } : null;
}

export async function knownGlossaryTerms(reads: PublicDataReadAdapter): Promise<GlossaryTerm[]> {
  const [universe, stored] = await Promise.all([
    collectGlossaryTerms(reads),
    getPostgresClient().sql<GlossaryTerm>('SELECT DISTINCT "term", "kind" FROM "translationGlossary"'),
  ]);
  const known = new Map(universe.map((entry) => [entry.term.toLowerCase(), entry]));
  for (const entry of stored) {
    const key = entry.term.toLowerCase();
    if (!known.has(key)) known.set(key, entry);
  }
  return [...known.values()].sort((a, b) => a.term.localeCompare(b.term));
}

export async function upsertGlosses(rows: readonly { term: string; kind: string; gloss: string }[], by: string | null): Promise<number> {
  if (rows.length === 0) return 0;
  assertDataWritesNotFrozen("upsertGlosses");
  const trimmed = rows.map((row) => ({ term: row.term.trim(), kind: row.kind.trim(), gloss: row.gloss.trim() }));
  for (const row of trimmed) {
    if (row.gloss.length === 0) throw new GlossaryGlossError(`The gloss for "${row.term}" is empty.`);
    if (row.gloss.length > GLOSS_MAX_LENGTH) {
      throw new GlossaryGlossError(`The gloss for "${row.term}" is ${row.gloss.length} characters; the limit is ${GLOSS_MAX_LENGTH}.`);
    }
  }
  const written = await getPostgresClient().sql<{ term: string }>(
    `INSERT INTO "translationGlossaryTerms" ("term", "kind", "gloss", "updated_at", "updated_by")
     SELECT t, k, g, $4, $5 FROM UNNEST($1::text[], $2::text[], $3::text[]) AS draft(t, k, g)
     ON CONFLICT ("term") DO UPDATE SET
       "kind" = EXCLUDED."kind", "gloss" = EXCLUDED."gloss", "updated_at" = EXCLUDED."updated_at", "updated_by" = EXCLUDED."updated_by"
     RETURNING "term"`,
    [trimmed.map((row) => row.term), trimmed.map((row) => row.kind), trimmed.map((row) => row.gloss), Date.now(), by],
  );
  return written.length;
}

export function glossDigestInput(glosses: Readonly<Record<string, string>>): string {
  return JSON.stringify(Object.entries(glosses).sort(([a], [b]) => a.localeCompare(b)));
}
