/**
 * Re-reads every article the plan touched and confirms each field now holds the
 * planned value. This is the proof that the write landed, independent of the
 * mutation's own success report.
 *
 * Usage: bun scripts/review/verify-review-plan.ts [--plan <path>]
 */
import { readFileSync } from "node:fs";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { getByPath, validateArticle, assertCitationsResolve } from "./lib/reviewDecisionTransforms";

const argv = process.argv.slice(2);
const planIndex = argv.indexOf("--plan");
const planPath = planIndex >= 0 ? argv[planIndex + 1] : "outputs/review-decisions/plan.json";
const plan = JSON.parse(readFileSync(planPath, "utf8"));

const { client } = createDataClient();

let checked = 0;
let matched = 0;
const mismatches: Array<{ slug: string; path: string; expected: string; actual: string }> = [];
const invalidDocuments: Array<{ slug: string; reason: string }> = [];

/**
 * Order-insensitive canonical form. Postgres returns object keys in its own
 * (alphabetical) order, so a plain JSON.stringify comparison reports every
 * `{min,max,unit}` triple as changed when nothing changed at all.
 */
function canonical(value: unknown): string {
  const normalize = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(normalize);
    if (typeof node === "object" && node !== null) {
      return Object.fromEntries(
        Object.keys(node)
          .sort()
          .map((key) => [key, normalize(Reflect.get(node, key))]),
      );
    }
    return node;
  };
  return JSON.stringify(normalize(value) ?? null);
}

for (const article of plan.articles) {
  const stored = await client.query(api.substanceIndex.getBySlug, { slug: article.slug });
  if (!stored) {
    invalidDocuments.push({ slug: article.slug, reason: "article not found after write" });
    continue;
  }

  // The stored document must still satisfy the contract and resolve its cites.
  try {
    assertCitationsResolve(stored, article.slug);
    validateArticle(stored, article.slug);
  } catch (error) {
    invalidDocuments.push({
      slug: article.slug,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  // Replay the planned changes in order; a later change may legitimately
  // supersede an earlier one at the same path, so only the last wins.
  const lastByPath = new Map<string, unknown>();
  for (const change of article.changes) {
    if (change.kind === "route_removal") continue;
    lastByPath.set(change.storagePath, change.after);
  }

  for (const [storagePath, expected] of lastByPath) {
    checked += 1;
    const actual = getByPath(stored, storagePath);
    if (canonical(actual) === canonical(expected)) {
      matched += 1;
      continue;
    }
    mismatches.push({
      slug: article.slug,
      path: storagePath,
      expected: canonical(expected).slice(0, 160),
      actual: canonical(actual).slice(0, 160),
    });
  }

  // Removals must be absent from the stored routes.
  for (const change of article.changes) {
    if (change.kind !== "route_removal") continue;
    checked += 1;
    const section = change.storagePath.split(".")[0];
    const routes = getByPath(stored, `${section}.routes`);
    const removedName = String(
      change.before && typeof change.before === "object"
        ? (Reflect.get(change.before, "route") ?? "")
        : "",
    ).toLowerCase();
    const stillPresent =
      Array.isArray(routes) &&
      routes.some(
        (route) =>
          typeof route === "object" &&
          route !== null &&
          String(Reflect.get(route, "route") ?? "").toLowerCase() === removedName,
      );
    if (stillPresent) {
      mismatches.push({
        slug: article.slug,
        path: change.storagePath,
        expected: `route "${removedName}" removed`,
        actual: "route still present",
      });
    } else {
      matched += 1;
    }
  }
}

console.log(`fields verified   : ${checked}`);
console.log(`matched           : ${matched}`);
console.log(`mismatched        : ${mismatches.length}`);
console.log(`invalid documents : ${invalidDocuments.length}`);

if (mismatches.length) {
  console.log("\nmismatches:");
  for (const entry of mismatches.slice(0, 40)) {
    console.log(`  ${entry.slug} ${entry.path}`);
    console.log(`    expected ${entry.expected}`);
    console.log(`    actual   ${entry.actual}`);
  }
}
if (invalidDocuments.length) {
  console.log("\ninvalid documents:");
  for (const entry of invalidDocuments) console.log(`  ${entry.slug}: ${entry.reason.slice(0, 220)}`);
}
process.exit(mismatches.length || invalidDocuments.length ? 1 : 0);
