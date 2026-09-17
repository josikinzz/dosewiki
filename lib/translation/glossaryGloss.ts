/**
 * One English definition ("gloss") per glossary term, shared by every locale.
 * It lives in Postgres (`translationGlossaryTerms`, migration 0011) beside the
 * per-locale renderings in `translationGlossary`, so an editor can write it
 * once in the Glossary tab and every locale's prompt injects it beside the
 * approved rendering of any term a batch mentions.
 *
 * A gloss is one line: what the term is, where it appears on the site, and
 * the contrast that matters when rendering it. It is part of the prompt, so
 * it is part of the prompt digest (`promptVersionFor` in liveTranslation.ts):
 * changing one marks the segments that mention its term stale, exactly as a
 * rendering edit does. Seeded from `data/i18n/glossary/glosses/`
 * by `load-glosses.ts`; published on the public /glossary page.
 */
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

/** Longest gloss a writer may store: one line, not a paragraph. */
export const GLOSS_MAX_LENGTH = 240;

/** A gloss write refused because a definition is empty or longer than one line. */
export class GlossaryGlossError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GlossaryGlossError";
  }
}

const ROW_COLUMNS = '"term", "kind", "gloss", "updated_at", "updated_by"';

/** Every gloss, sorted by term the way the digest sorts them. */
export async function readGlosses(): Promise<GlossaryGloss[]> {
  const rows = await getPostgresClient().sql<GlossaryGloss>(`SELECT ${ROW_COLUMNS} FROM "translationGlossaryTerms"`);
  return rows
    .map((row) => ({ ...row, updated_at: Number(row.updated_at) }))
    .sort((a, b) => a.term.localeCompare(b.term));
}

/** `term -> gloss`, the shape the engine injects into prompts beside the locale's `term -> target` map. */
export async function loadGlosses(): Promise<Readonly<Record<string, string>>> {
  return Object.fromEntries((await readGlosses()).map((row) => [row.term, row.gloss]));
}

/** The gloss row for one term, matched case-insensitively so a request spelled differently still finds the stored row. */
export async function findGloss(term: string): Promise<GlossaryGloss | null> {
  const [row] = await getPostgresClient().sql<GlossaryGloss>(
    `SELECT ${ROW_COLUMNS} FROM "translationGlossaryTerms" WHERE LOWER("term") = LOWER($1) LIMIT 1`,
    [term.trim()],
  );
  return row ? { ...row, updated_at: Number(row.updated_at) } : null;
}

/**
 * Every term that may take a gloss: the locale-independent universe the
 * site publishes today, plus every term any locale's glossary already holds
 * (a term renamed or retired on the site keeps its approved rows, and those
 * rows still reach prompts). Deduped case-insensitively; the universe's
 * spelling and kind win, sorted by term.
 */
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

/**
 * Insert or replace glosses. The term's spelling is stored as given: callers
 * resolve it against the term universe first (the gloss route, the seed
 * loader). Refused whole when any gloss is empty once trimmed or longer than
 * `GLOSS_MAX_LENGTH`.
 */
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

/**
 * The glosses' contribution to the prompt digest: the pairs sorted by term,
 * the same shape as `glossaryDigestInput`, so a gloss edit changes the digest
 * and marks the segments that mention its term stale.
 */
export function glossDigestInput(glosses: Readonly<Record<string, string>>): string {
  return JSON.stringify(Object.entries(glosses).sort(([a], [b]) => a.localeCompare(b)));
}
