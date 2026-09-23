/**
 * Bulk import handlers run in one serializable transaction, and the runtime
 * issues no savepoints. After one failed statement Postgres aborts the whole
 * transaction: every later statement fails with 25P02 and COMMIT becomes a
 * rollback. A per-row catch would therefore report counts for rows that never
 * land. Bulk handlers validate every row before any SQL and write nothing when
 * a row is invalid; after that, the first SQL failure rejects the mutation
 * with the failing row named.
 */

/**
 * The first SQL failure, prefixed with the row it happened on. The SQLSTATE
 * code is kept so the runtime still retries serialization failures.
 */
export function bulkRowFailure(row: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const failure = Object.assign(new Error(`${row}: ${message}`), { cause: error });
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (typeof code === "string") Object.assign(failure, { code });
  return failure;
}

/**
 * Pre-SQL validation shared by the slug-keyed bulk imports: a slug repeated in
 * one batch would make the later row silently overwrite the earlier one.
 */
export function duplicateSlugErrors(slugs: readonly string[], row: (slug: string) => string): string[] {
  const seen = new Set<string>();
  const reported = new Set<string>();
  const errors: string[] = [];
  for (const slug of slugs) {
    if (seen.has(slug) && !reported.has(slug)) {
      reported.add(slug);
      errors.push(`${row(slug)}: slug appears more than once in this batch`);
    }
    seen.add(slug);
  }
  return errors;
}
