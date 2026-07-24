#!/usr/bin/env node
/**
 * Copy subjective effects sections from a parent substance onto its prodrugs.
 *
 * Only prodrug relationships qualify. Enantiomers (armodafinil, dexmethylphenidate,
 * dextroamphetamine) are deliberately excluded: a different arrangement of the same
 * atoms is not a prodrug relationship.
 *
 * Every string in the copied section has the parent's name rewritten to the target's,
 * so a copied section never claims to describe the parent. The rewrite is reported
 * line by line in the dry run and asserted afterwards.
 *
 * Copied sections are marked via `subjective_effects.attribution`, which renders in
 * SubjectiveEffectsSection.tsx, so they read differently from hand-written ones.
 *
 * Usage:
 *   node scripts/convex/copy-prodrug-subjective-effects.mjs <targetUrl>
 *   node scripts/convex/copy-prodrug-subjective-effects.mjs <targetUrl> --write --confirm-subjective-effects-copy
 */
import process from "node:process";

const REPO = "/Users/josie/Documents/Utilities/mindstate-portal/dosewiki";
const { ConvexHttpClient } = await import(REPO + "/node_modules/convex/dist/esm/browser/index.js");
const { api } = await import(REPO + "/convex/_generated/api.js");
const { sanitizeObjectKeys, stripConvexMetadata } = await import(REPO + "/scripts/batch/summary/articles.mjs");

const targetUrl = process.argv[2];
const write = process.argv.includes("--write");
const confirmed = process.argv.includes("--confirm-subjective-effects-copy");
const apiKey = process.env.CONVEX_ADMIN_KEY;

if (!targetUrl) {
  console.error("usage: copy-prodrug-subjective-effects.mjs <targetUrl> [--write --confirm-subjective-effects-copy]");
  process.exit(1);
}
if (write && !confirmed) {
  console.error("refusing to write without --confirm-subjective-effects-copy");
  process.exit(1);
}
if (write && !apiKey) {
  console.error("CONVEX_ADMIN_KEY required to write");
  process.exit(1);
}

/**
 * `subject` is the parent name as it appears in prose; `replacement` is the target
 * name to substitute in. `relation` is the sentence recorded in the attribution.
 */
const PAIRS = [
  {
    target: "1b-lsd", source: "lsd", subject: "LSD", replacement: "1B-LSD",
    relation: "1B-LSD is a prodrug of LSD and is reported to produce an effectively identical experience.",
  },
  {
    target: "1cp-lsd", source: "lsd", subject: "LSD", replacement: "1cP-LSD",
    relation: "1cP-LSD is a prodrug of LSD and is reported to produce an effectively identical experience.",
  },
  {
    target: "1d-lsd", source: "lsd", subject: "LSD", replacement: "1D-LSD",
    relation: "1D-LSD is a prodrug of LSD and is reported to produce an effectively identical experience.",
  },
  {
    target: "1v-lsd", source: "lsd", subject: "LSD", replacement: "1V-LSD",
    relation: "1V-LSD is a prodrug of LSD and is reported to produce an effectively identical experience.",
  },
  {
    target: "1cp-al-lad", source: "al-lad", subject: "AL-LAD", replacement: "1cP-AL-LAD",
    relation: "1cP-AL-LAD is a suspected prodrug of AL-LAD and is reported to produce an effectively identical experience.",
  },
  {
    target: "1p-eth-lad", source: "eth-lad", subject: "ETH-LAD", replacement: "1P-ETH-LAD",
    relation: "1P-ETH-LAD is a suspected prodrug of ETH-LAD and is reported to produce an effectively identical experience.",
  },
  {
    target: "4-aco-det", source: "4-ho-det", subject: "4-HO-DET", replacement: "4-AcO-DET",
    relation: "4-AcO-DET is the acetylated prodrug of 4-HO-DET and is reported to produce an effectively identical experience.",
  },
  {
    target: "4-aco-mipt", source: "4-ho-mipt", subject: "4-HO-MiPT", replacement: "4-AcO-MiPT",
    relation: "4-AcO-MiPT is the acetylated prodrug of 4-HO-MiPT and is reported to produce an effectively identical experience.",
  },
  {
    target: "4-pro-dmt", source: "psilocin", subject: "psilocin", replacement: "4-PrO-DMT",
    relation: "4-PrO-DMT is the propionylated prodrug of psilocin (4-HO-DMT) and is reported to produce an effectively identical experience.",
  },
  {
    // Reverse direction: the acetylated prodrug is the article that carries the writeup.
    target: "4-ho-dipt", source: "4-aco-dipt", subject: "4-AcO-DiPT", replacement: "4-HO-DiPT",
    relation: "4-AcO-DiPT is the acetylated prodrug of 4-HO-DiPT, so the two are reported to produce an effectively identical experience.",
  },
  {
    target: "2c-b-an", source: "2c-b", subject: "2C-B", replacement: "2C-B-AN",
    relation: "2C-B-AN is a prodrug of 2C-B, converting to it in vivo, and is reported to produce an effectively identical experience.",
  },
  {
    target: "adrafinil", source: "modafinil", subject: "modafinil", replacement: "adrafinil",
    relation: "Adrafinil is a prodrug of modafinil and is reported to produce an effectively identical experience, with a slower onset.",
  },
  {
    target: "cloniprazepam", source: "clonazepam", subject: "clonazepam", replacement: "cloniprazepam",
    relation: "Cloniprazepam is a prodrug of clonazepam and is reported to produce an effectively identical experience.",
  },
];

/** Case-aware, whole-word substitution of the parent name with the target name. */
function makeRewriter(subject, replacement) {
  const escaped = subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "gi");
  return (text) =>
    text.replace(re, (match) => {
      const startsUpper = /^[A-Z]/.test(match);
      return startsUpper ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;
    });
}

/** Rewrite every string in the section except attribution, which is rebuilt separately. */
function rewriteSection(node, rewrite, path, changes) {
  if (typeof node === "string") {
    const next = rewrite(node);
    if (next !== node) changes.push({ path, before: node, after: next });
    return next;
  }
  if (Array.isArray(node)) return node.map((v, i) => rewriteSection(v, rewrite, `${path}[${i}]`, changes));
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = rewriteSection(v, rewrite, path ? `${path}.${k}` : k, changes);
    }
    return out;
  }
  return node;
}

function collectStrings(node, path, out) {
  if (typeof node === "string") { if (node.trim()) out.push([path, node]); return; }
  if (Array.isArray(node)) { node.forEach((v, i) => collectStrings(v, `${path}[${i}]`, out)); return; }
  if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) collectStrings(v, path ? `${path}.${k}` : k, out);
}

function catHasContent(cat) {
  if (!cat || typeof cat !== "object") return false;
  return Object.values(cat).some(
    (sub) => sub && ((sub.note && sub.note.trim()) || (Array.isArray(sub.effects) && sub.effects.length > 0)),
  );
}
function sensoryHasContent(sensory) {
  if (!sensory || typeof sensory !== "object") return false;
  return Object.values(sensory).some(
    (sense) => sense && ((sense.note && sense.note.trim()) || catHasContent(sense.subcategories)),
  );
}
function hasSubjectiveEffects(se) {
  if (!se || se.is_stub === true) return false;
  const notes = se.notes || {};
  const anyNote = ["overview", "sensory", "cognitive", "physical"].some((k) => notes[k] && notes[k].trim());
  return anyNote || sensoryHasContent(se.sensory) || catHasContent(se.cognitive) || catHasContent(se.physical) || catHasContent(se.progressive_stages);
}

const client = new ConvexHttpClient(targetUrl);
const clean = (a) => sanitizeObjectKeys(stripConvexMetadata(a));

const plan = [];
const blocked = [];

for (const pair of PAIRS) {
  const [sourceArticle, targetArticle] = await Promise.all([
    client.query(api.substanceIndex.getBySlug, { slug: pair.source }),
    client.query(api.substanceIndex.getBySlug, { slug: pair.target }),
  ]);

  if (!sourceArticle) { blocked.push(`${pair.target}: source article ${pair.source} not found`); continue; }
  if (!targetArticle) { blocked.push(`${pair.target}: target article not found`); continue; }
  if (!hasSubjectiveEffects(sourceArticle.subjective_effects)) {
    blocked.push(`${pair.target}: source ${pair.source} has no subjective effects to copy`); continue;
  }
  if (hasSubjectiveEffects(targetArticle.subjective_effects)) {
    blocked.push(`${pair.target}: already has subjective effects content, refusing to overwrite`); continue;
  }

  const { attribution: sourceAttribution, ...body } = sourceArticle.subjective_effects;
  const rewrite = makeRewriter(pair.subject, pair.replacement);
  const changes = [];
  const rewritten = rewriteSection(body, rewrite, "", changes);

  // The copied section must not still describe the parent. Target names often contain
  // the parent name (1B-LSD, 2C-B-AN), so mask the target name before looking for it.
  const remaining = [];
  collectStrings(rewritten, "", remaining);
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const subjectRe = new RegExp(`\\b${escapeRe(pair.subject)}\\b`, "i");
  const replacementRe = new RegExp(`\\b${escapeRe(pair.replacement)}\\b`, "gi");
  const leftovers = remaining.filter(([, s]) => subjectRe.test(s.replace(replacementRe, "@")));

  const originalProvenance = sourceAttribution?.text?.trim() ?? "";
  rewritten.attribution = {
    author: sourceAttribution?.author ?? "Josie Kins",
    text: `Adapted from the ${sourceArticle.title} subjective effects documentation. ${pair.relation}${originalProvenance ? ` ${originalProvenance}` : ""}`,
    url: sourceAttribution?.url ?? "",
  };

  plan.push({ pair, sourceArticle, targetArticle, rewritten, changes, leftovers });
}

console.log(`\n${"=".repeat(78)}`);
console.log(`Prodrug subjective-effects copy — ${write ? "WRITE" : "DRY RUN"} against ${targetUrl}`);
console.log("=".repeat(78));

for (const entry of plan) {
  const { pair, sourceArticle, targetArticle, changes, leftovers } = entry;
  console.log(`\n--- ${targetArticle.title}  <-  ${sourceArticle.title}  (${changes.length} name rewrites) ---`);
  for (const c of changes) {
    console.log(`  [${c.path}]`);
    console.log(`    -  ${c.before.replace(/\s+/g, " ").slice(0, 220)}`);
    console.log(`    +  ${c.after.replace(/\s+/g, " ").slice(0, 220)}`);
  }
  if (leftovers.length) {
    console.log(`  !! ${leftovers.length} string(s) still mention "${pair.subject}" after rewrite:`);
    for (const [p, s] of leftovers) console.log(`     [${p}] ${s.replace(/\s+/g, " ").slice(0, 220)}`);
  }
  console.log(`  attribution: ${entry.rewritten.attribution.text}`);
}

if (blocked.length) {
  console.log(`\n--- skipped (${blocked.length}) ---`);
  for (const b of blocked) console.log(`  ${b}`);
}

const withLeftovers = plan.filter((p) => p.leftovers.length);
console.log(`\nplanned=${plan.length} skipped=${blocked.length} needingManualReview=${withLeftovers.length}`);

if (withLeftovers.length) {
  console.error("\nRefusing to proceed: some copied sections still name the parent substance.");
  process.exit(1);
}

if (!write) {
  console.log("\nDry run only. Re-run with --write --confirm-subjective-effects-copy to apply.");
  process.exit(0);
}

/**
 * Some target articles predate later schema fields and are missing structural keys
 * (e.g. pharmacology.receptor_profile). saveSubstance validates the whole article, so
 * those pre-existing gaps block an unrelated section write. Fill ONLY keys the
 * validator reports as `received undefined`, with the empty value for their type.
 * Never overwrites a value that already exists.
 */
const EMPTY_FOR_TYPE = { array: [], string: "", object: {}, boolean: false, number: 0 };

function parseMissingPaths(message) {
  const out = [];
  const re = /([A-Za-z0-9_.[\]]+): Invalid input: expected (\w+), received undefined/g;
  let m;
  while ((m = re.exec(message)) !== null) out.push({ path: m[1], type: m[2] });
  return out;
}

function fillPath(obj, path, value) {
  const parts = path.split(".");
  let node = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (node[parts[i]] === undefined || node[parts[i]] === null) node[parts[i]] = {};
    node = node[parts[i]];
  }
  const leaf = parts[parts.length - 1];
  if (node[leaf] !== undefined && node[leaf] !== null) return false;
  node[leaf] = value;
  return true;
}

/**
 * Required by pharmacologySchema but absent on older documents. Prod returns a bare
 * "Server Error" without field detail, so these are filled pre-emptively rather than
 * discovered from the validator message. Only applied when genuinely missing.
 */
const REQUIRED_EMPTY = [
  { path: "pharmacology.receptor_profile", value: [] },
  { path: "pharmacology.pharmacokinetics", value: "" },
  { path: "pharmacology.metabolites", value: [] },
];

let wrote = 0;
const failed = [];
for (const entry of plan) {
  const article = clean({ ...entry.targetArticle, subjective_effects: entry.rewritten });
  const repairs = [];

  for (const { path, value } of REQUIRED_EMPTY) {
    if (fillPath(article, path, structuredClone(value))) repairs.push(path);
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const result = await client.mutation(api.substanceIndex.saveSubstance, { apiKey, article });
      wrote += 1;
      const note = repairs.length ? ` (also filled empty: ${repairs.join(", ")})` : "";
      console.log(`  wrote ${entry.targetArticle.title}: updated=${result.updated}${note}`);
      break;
    } catch (error) {
      const message = String(error?.message ?? error);
      const missing = parseMissingPaths(message).filter((x) => x.type in EMPTY_FOR_TYPE);
      const applied = missing.filter((x) =>
        fillPath(article, x.path, structuredClone(EMPTY_FOR_TYPE[x.type])),
      );
      if (!applied.length) {
        failed.push({ title: entry.targetArticle.title, message });
        console.log(`  FAILED ${entry.targetArticle.title}: ${message.split("\n")[0]}`);
        break;
      }
      repairs.push(...applied.map((x) => x.path));
    }
  }
}

console.log(`\nwrote=${wrote} failed=${failed.length}`);
if (failed.length) process.exitCode = 1;
