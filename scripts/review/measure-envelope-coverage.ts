/**
 * Reports how many reviewed patches the deterministic normalizers can convert,
 * and lists the residue that needs an editorial decision. Read-only.
 *
 * Usage: bun scripts/review/measure-envelope-coverage.ts <work.json>
 */
import { readFileSync } from "node:fs";
import {
  asBindingSites,
  asCountryLegality,
  asNamedItems,
  asParagraphs,
  asRange,
  asStageList,
  asStageMap,
  describeShape,
} from "./lib/reviewEnvelopes";

type Patch = { operation: string; path: string; before?: unknown; after?: unknown };
type ReviewRecord = {
  id: string;
  slug: string;
  _kind?: string;
  research: { patches?: Patch[]; target?: { section?: string } };
  decision: { decision: string; outcome: string; note?: string };
};

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("usage: bun scripts/review/measure-envelope-coverage.ts <work.json>");
  process.exit(1);
}

const records: ReviewRecord[] = JSON.parse(readFileSync(inputPath, "utf8"));

const KINDS = [
  "stageMap",
  "stageList",
  "range",
  "bindingSites",
  "countryLegality",
  "paragraphs",
  "namedItems",
  "removal",
];

function classify(after: unknown): string | null {
  if (asStageMap(after)) return "stageMap";
  if (asStageList(after)) return "stageList";
  if (asRange(after)) return "range";
  if (asBindingSites(after)) return "bindingSites";
  if (asCountryLegality(after)) return "countryLegality";
  if (asParagraphs(after)) return "paragraphs";
  if (asNamedItems(after)) return "namedItems";
  return null;
}

const byKind = new Map<string, number>();
const unresolved: Array<{ id: string; slug: string; section: string; shape: string }> = [];
let totalPatches = 0;
const covered = new Set<string>();
const needsHuman = new Set<string>();

for (const record of records) {
  if (record._kind && /^[DEF]/.test(record._kind)) continue;
  const patches = (record.research.patches ?? []).filter((patch) => patch.operation !== "none");
  if (!patches.length) continue;
  let allCovered = true;
  for (const patch of patches) {
    totalPatches += 1;
    if (patch.after === null || patch.after === undefined) {
      byKind.set("removal", (byKind.get("removal") ?? 0) + 1);
      continue;
    }
    const kind = classify(patch.after);
    if (kind) {
      byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
      continue;
    }
    allCovered = false;
    unresolved.push({
      id: record.id,
      slug: record.slug,
      section: record.research.target?.section ?? "?",
      shape: describeShape(patch.after),
    });
  }
  if (allCovered) covered.add(record.id);
  else needsHuman.add(record.id);
}

console.log(`patches examined: ${totalPatches}`);
console.log("\ndeterministically convertible by kind:");
for (const kind of KINDS) {
  const count = byKind.get(kind);
  if (count) console.log(`  ${String(count).padStart(3)}  ${kind}`);
}
const coveredPatches = [...byKind.values()].reduce((sum, count) => sum + count, 0);
console.log(`\ncovered patches: ${coveredPatches} / ${totalPatches}`);
console.log(`records fully covered:   ${covered.size}`);
console.log(`records needing a human: ${needsHuman.size}`);

const shapeTally = new Map<string, string[]>();
for (const entry of unresolved) {
  const list = shapeTally.get(entry.shape) ?? [];
  list.push(entry.id);
  shapeTally.set(entry.shape, list);
}
console.log("\nunresolved shapes, most common first:");
for (const [shape, ids] of [...shapeTally.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(ids.length).padStart(2)}  ${shape}`);
  console.log(`      ${[...new Set(ids)].join(", ")}`);
}

console.log(`\nrecords needing a human (${needsHuman.size}):\n  ${[...needsHuman].join(" ")}`);
