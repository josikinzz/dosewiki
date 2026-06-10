/**
 * Script-side adapter for the canonical substance slug algorithm.
 *
 * The source of truth is `src/utils/slug.ts`. Plain-node `.mjs` scripts cannot
 * import that TypeScript module directly, so this file mirrors the algorithm
 * byte-for-byte. `scripts/lib/slug.test.mjs` asserts parity against the
 * TypeScript implementation on a shared fixture set — update both together.
 */
export function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
