export function bulkRowFailure(row: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const failure = Object.assign(new Error(`${row}: ${message}`), { cause: error });
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (typeof code === "string") Object.assign(failure, { code });
  return failure;
}

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
