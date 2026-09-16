/**
 * Writes one self-contained briefing per refused record, so an editorial pass
 * can decide the exact storage path and value without exploring the codebase.
 *
 * Each briefing carries the reviewed proposal, the refusal reason, and the LIVE
 * stored values at every candidate path in the target section. That last part is
 * what makes the decision checkable: the writer picks from paths that exist
 * rather than inventing one.
 *
 * Usage:
 *   bun scripts/review/build-record-briefings.ts \
 *     --work outputs/review-decisions/work.json \
 *     --plan outputs/review-decisions/plan.json \
 *     --out  outputs/review-decisions/briefings
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { getByPath } from "./lib/reviewDecisionTransforms";
import { describeShape } from "./lib/reviewEnvelopes";


type Patch = { operation: string; path: string; before?: unknown; after?: unknown };
type ReviewRecord = {
  id: string;
  slug: string;
  article: string;
  _kind?: string;
  research: {
    issue?: string;
    change_summary?: string;
    editor_note?: string;
    patches?: Patch[];
    target?: { section?: string; field_paths?: string[] };
    sources?: Array<{ id: string; bibliography?: string; url?: string }>;
    open_questions?: string[];
  };
  decision: { decision: string; outcome: string; note?: string };
};

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const next = argv[index + 1];
    args[token.slice(2)] = next && !next.startsWith("--") ? next : "true";
    if (next && !next.startsWith("--")) index += 1;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const records: ReviewRecord[] = JSON.parse(
  readFileSync(args.work ?? "outputs/review-decisions/work.json", "utf8"),
);
const plan = JSON.parse(readFileSync(args.plan ?? "outputs/review-decisions/plan.json", "utf8"));
const outDir = args.out ?? "outputs/review-decisions/briefings";

const refusalsByRecord = new Map<string, string[]>();
for (const refusal of plan.refusals as Array<{ recordId: string; reason: string }>) {
  const list = refusalsByRecord.get(refusal.recordId) ?? [];
  list.push(refusal.reason);
  refusalsByRecord.set(refusal.recordId, list);
}

/** Leaf paths worth showing for a section, so the writer sees real options. */
const SECTION_PATHS: Record<string, string[]> = {
  pharmacology: [
    "pharmacology.pharmacodynamics",
    "pharmacology.pharmacokinetics",
    "pharmacology.summary",
    "pharmacology.binding_sites",
    "pharmacology.metabolites",
    "pharmacology.protein_binding",
    "pharmacology.volume_of_distribution",
    "pharmacology.bioavailability_notes",
    "pharmacology.half_life",
  ],
  tolerance: [
    "tolerance.full_tolerance",
    "tolerance.half_tolerance",
    "tolerance.baseline_tolerance",
    "tolerance.cross_tolerance",
  ],
  legality: ["legality.international", "legality.countries", "legality.usStates", "legality.usStatesNote"],
  harm_potential: ["harm_potential"],
  subjective_effects: ["subjective_effects"],
  interactions: ["interactions"],
  history_culture: ["history_culture"],
  identification: ["identification"],
};

const { client } = createDataClient();
const cache = new Map<string, unknown>();

async function loadArticle(slug: string): Promise<unknown> {
  const cached = cache.get(slug);
  if (cached) return cached;
  const document = await client.query(api.substanceIndex.getBySlug, { slug });
  cache.set(slug, document);
  return document;
}

/** Renders a value for a briefing: full when short, elided when long. */
function preview(value: unknown, limit = 400): string {
  if (value === undefined) return "(key absent)";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}… [${text.length} chars total]`;
}

mkdirSync(outDir, { recursive: true });
const written: string[] = [];

for (const record of records) {
  const reasons = refusalsByRecord.get(record.id);
  if (!reasons) continue;
  const article = await loadArticle(record.slug);
  const lines: string[] = [];

  lines.push(`# ${record.id} — ${record.article} (slug: ${record.slug})`);
  lines.push("");
  lines.push(`- Decision: **${record.decision.decision}**`);
  lines.push(`- Research outcome: ${record.decision.outcome}`);
  if (record.decision.note && record.decision.note !== "(none)") {
    lines.push(`- Reviewer note: **${record.decision.note}**`);
  }
  lines.push(`- Target section: ${record.research.target?.section ?? "(unstated)"}`);
  lines.push("");
  lines.push("## Why the automatic conversion refused");
  for (const reason of [...new Set(reasons)]) lines.push(`- ${reason}`);
  lines.push("");
  lines.push("## Reported issue");
  lines.push(record.research.issue ?? "(none)");
  lines.push("");
  lines.push("## Approved change summary");
  lines.push(record.research.change_summary ?? "(none)");
  if (record.research.editor_note) {
    lines.push("");
    lines.push("## Editor note from the review");
    lines.push(record.research.editor_note);
  }
  lines.push("");
  lines.push("## Reviewed patches, verbatim");
  lines.push("```json");
  lines.push(JSON.stringify(record.research.patches ?? [], null, 1));
  lines.push("```");

  lines.push("");
  lines.push("## Sources this record supplies");
  for (const source of record.research.sources ?? []) {
    lines.push(`- \`${source.id}\` — ${source.bibliography ?? "(no bibliography)"}`);
    if (source.url) lines.push(`  ${source.url}`);
  }
  if (!(record.research.sources ?? []).length) lines.push("- (none)");

  lines.push("");
  lines.push("## LIVE stored values — pick a path that appears here");
  const sectionKey = (record.research.target?.section ?? "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "_")
    .replace(/^_|_$/g, "");
  const candidatePaths = new Set<string>();
  for (const [key, paths] of Object.entries(SECTION_PATHS)) {
    if (sectionKey.includes(key.split("_")[0])) for (const candidate of paths) candidatePaths.add(candidate);
  }
  for (const declared of record.research.target?.field_paths ?? []) candidatePaths.add(declared);
  if (!candidatePaths.size) for (const paths of Object.values(SECTION_PATHS)) for (const p of paths) candidatePaths.add(p);

  for (const candidate of [...candidatePaths].sort()) {
    const value = getByPath(article, candidate);
    lines.push(`- \`${candidate}\` (${describeShape(value)}): ${preview(value, 300)}`);
  }

  // Route-bearing sections need their live route names and indices.
  for (const section of ["duration", "dosage"] as const) {
    const routes = getByPath(article, `${section}.routes`);
    if (!Array.isArray(routes)) continue;
    lines.push("");
    lines.push(`### ${section}.routes — live route names and indices`);
    routes.forEach((route, index) => {
      const name = getByPath(route, "route");
      lines.push(`- \`${section}.routes[${index}]\` route = ${JSON.stringify(name)}`);
      const inner = section === "duration" ? "stages" : "dose_ranges";
      const group = getByPath(route, inner);
      lines.push(`  \`${section}.routes[${index}].${inner}\` = ${preview(group, 320)}`);
    });
    if (!routes.length) lines.push("- (no routes stored; adding one is a create, not an edit)");
  }

  lines.push("");
  lines.push("## Visibility fields, live");
  lines.push(`- \`priority\` = ${JSON.stringify(getByPath(article, "priority"))}`);
  lines.push(`- \`index_categories\` = ${JSON.stringify(getByPath(article, "index_categories"))}`);

  const file = path.join(outDir, `${record.id.replace(/::/g, "--")}.md`);
  writeFileSync(file, `${lines.join("\n")}\n`);
  written.push(file);
}

console.log(`briefings written: ${written.length} -> ${outDir}`);
