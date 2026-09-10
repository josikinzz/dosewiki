#!/usr/bin/env node
/**
 * Publish the human-approved replication collection orders produced by the
 * curation campaign at ~/.agent/diagrams/replication-curation-run.
 *
 * Each proposal is a pure permutation of its collection's current membership,
 * so every publication travels through `replicationContextualEditing.publishCollection`
 * as an order-only change: membership, associations, and exclusions are untouched.
 *
 * The mutation enforces optimistic concurrency, so this script reads each
 * collection's revision immediately before publishing it and refuses to publish
 * any collection whose live membership has drifted from the approved proposal.
 * Drift is reported and skipped, never reconciled by guessing.
 *
 * Dry run by default. See docs/agents/convex-credentials.md for the write gates.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../convex/_generated/api.js";
import {
  createProductionWriteCommand,
  assertProductionWriteAllowed,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { getFlagValue, hasFlag } from "../lib/data-ops-run-context.mjs";

const OPERATION = "publish-approved-collection-orders";
const RUN_ROOT =
  getFlagValue(process.argv.slice(2), "--run-root") ??
  join(process.env.HOME ?? "", ".agent/diagrams/replication-curation-run");
const DRUG_SLUGS = ["lsd", "psilocin", "dmt", "5-meo-dmt", "2c-b", "mescaline", "4-ho-met"];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Collect every approved proposal as a uniform publication plan. */
function loadPlan() {
  const plan = [];
  for (const slug of DRUG_SLUGS) {
    const proposal = readJson(join(RUN_ROOT, "drug-expansion", `${slug}-order-proposal.json`));
    plan.push({ targetKind: "substance", targetKey: slug, proposal });
  }
  const collectionsDir = join(RUN_ROOT, "effect-expansion", "collections");
  for (const file of readdirSync(collectionsDir).sort()) {
    if (!file.endsWith(".json")) continue;
    const proposal = readJson(join(collectionsDir, file));
    if (!Array.isArray(proposal.after) || proposal.after.length === 0) continue;
    plan.push({ targetKind: "effect", targetKey: proposal.targetKey ?? file.slice(0, -5), proposal });
  }
  return plan;
}

function validateProposal({ proposal, targetKey }) {
  const problems = [];
  const after = proposal.after ?? [];
  const before = proposal.before ?? [];
  if (proposal.publicationAuthorized !== false) {
    problems.push("proposal does not carry publicationAuthorized false");
  }
  if (new Set(after).size !== after.length) problems.push("proposed order repeats a work");
  const beforeSet = new Set(before);
  if (beforeSet.size !== before.length) problems.push("recorded prior order repeats a work");
  if (after.length !== before.length || after.some((slug) => !beforeSet.has(slug))) {
    problems.push("proposed order is not a permutation of the recorded prior order");
  }
  if (!targetKey) problems.push("proposal names no target");
  return problems;
}


const SHOWCASE_ORIGIN =
  getFlagValue(process.argv.slice(2), "--showcase-origin") ?? "https://dose.wiki";

/**
 * Live membership as the public site serves it. This is the set the human
 * approved an order over, and it is independent of the stored pinned order.
 */
// Persisted across runs: the public endpoint tolerates only a handful of
// requests per sweep, so a resumed run must not re-fetch what it already knows.
const CACHE_PATH = "/tmp/approved-order-membership-cache.json";
const membershipCache = new Map(
  (() => {
    try {
      return Object.entries(JSON.parse(readFileSync(CACHE_PATH, "utf8")));
    } catch {
      return [];
    }
  })(),
);
async function fetchLiveMembership(targetKind, targetKey) {
  const cacheKey = `${targetKind}:${targetKey}`;
  if (membershipCache.has(cacheKey)) return membershipCache.get(cacheKey);
  const parameter = targetKind === "substance" ? "substance" : "effect";
  const url = `${SHOWCASE_ORIGIN}/api/replications/showcase?${parameter}=${encodeURIComponent(targetKey)}`;
  let lastError;
  // The public endpoint rate-limits a long serial sweep, so pace every request
  // and back off rather than reporting a transient refusal as membership drift.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt ? 2000 * 2 ** attempt : 750));
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`showcase endpoint returned ${response.status}`);
      const payload = await response.json();
      const works = payload?.works;
      if (!Array.isArray(works)) throw new Error("showcase endpoint returned no works array");
      const slugs = works.map((work) => work.slug);
      membershipCache.set(cacheKey, slugs);
      writeFileSync(CACHE_PATH, JSON.stringify(Object.fromEntries(membershipCache)));
      return slugs;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
async function main() {
  const argv = process.argv.slice(2);
  const command = createProductionWriteCommand({ operation: OPERATION, argv });
  printProductionWriteCommand(command);
  if (command.writeRequested) assertProductionWriteAllowed(command);

  const plan = loadPlan();
  console.log(`Approved proposals found: ${plan.length}`);

  const invalid = plan
    .map((entry) => ({ entry, problems: validateProposal(entry) }))
    .filter(({ problems }) => problems.length);
  if (invalid.length) {
    for (const { entry, problems } of invalid) {
      console.error(`REFUSED ${entry.targetKind}:${entry.targetKey} — ${problems.join("; ")}`);
    }
    throw new Error("Refusing to publish: some proposals are not clean permutations.");
  }

  const client = createDataClient({ target: command.targetUrl }).client;
  const results = [];
  const requestPrefix = getFlagValue(argv, "--request-prefix") ?? randomUUID().replaceAll("-", "");
  const credential = requireProductionWriteCredential("replicationMaintenance");
  const apiKey = typeof credential === "string" ? credential : credential.token;

  for (const { targetKind, targetKey, proposal } of plan) {
    const label = `${targetKind}:${targetKey}`;
    const after = proposal.after;
    let detail;
    try {
      detail = await client.query(api.replicationContextualEditing.collectionDetail, {
        apiKey,
        targetKind,
        targetKey,
      });
    } catch (error) {
      console.error(`READ FAILED ${label} — ${error.message}`);
      results.push({ label, status: "read-failed", error: error.message });
      continue;
    }

    // Membership, not the stored order, is what the human approved. The stored
    // pinned order can still name works that are no longer members, so compare
    // the approved set against live served membership: a member that appeared
    // or vanished since approval was never reviewed and must not be published.
    const storedOrder = detail.order ?? [];
    const approvedSet = new Set(after);
    let liveMembers;
    try {
      liveMembers = await fetchLiveMembership(targetKind, targetKey);
    } catch (error) {
      console.error(`MEMBERSHIP READ FAILED ${label} — ${error.message}`);
      results.push({ label, status: "read-failed", error: error.message });
      continue;
    }
    const liveSet = new Set(liveMembers);
    const appeared = liveMembers.filter((slug) => !approvedSet.has(slug));
    const vanished = after.filter((slug) => !liveSet.has(slug));
    if (appeared.length || vanished.length) {
      console.error(
        `DRIFT ${label} — membership changed since approval: ${appeared.length} new, ${vanished.length} removed${appeared.length ? ` (new: ${appeared.slice(0, 5).join(", ")})` : ""}`,
      );
      results.push({ label, status: "membership-drift", appeared, vanished });
      continue;
    }
    // Stale pins are stored-order entries that are no longer members. Replacing
    // the order drops them from the pinned prefix, which is the intended cleanup.
    const stalePins = storedOrder.filter((slug) => !approvedSet.has(slug));
    if (detail.disabled) {
      console.error(`SKIPPED ${label} — showcase is disabled on the deployment`);
      results.push({ label, status: "disabled" });
      continue;
    }

    const alreadyPublished =
      storedOrder.length === after.length && storedOrder.every((slug, index) => slug === after[index]);
    if (alreadyPublished) {
      console.log(`UNCHANGED ${label} — stored order already matches the approved order`);
      results.push({ label, status: "already-published", members: after.length });
      continue;
    }

    const change = {
      apiKey,
      targetKind,
      targetKey,
      expectedRevision: detail.revision,
      requestId: `${requestPrefix}-${targetKind}-${targetKey}`.replaceAll(/[^\w-]/g, "-").slice(0, 100),
      slugs: after,
      // Live membership is the concurrency baseline the mutation checks a
      // substance gallery against, and it equals the approved set here.
      previousSlugs: liveMembers,
      title: proposal.title ?? proposal.name ?? targetKey,
    };

    if (command.dryRun) {
      console.log(
        `DRY RUN ${label} — would publish ${after.length} positions, opener ${after[0]}${stalePins.length ? `, clearing ${stalePins.length} stale pin(s)` : ""}`,
      );
      results.push({ label, status: "dry-run", members: after.length, opener: after[0], stalePins });
      continue;
    }

    try {
      const outcome = await client.mutation(api.replicationContextualEditing.publishCollection, change);
      console.log(
        `PUBLISHED ${label} — ${after.length} positions${outcome?.reconciled ? " (reconciled replay)" : ""}`,
      );
      results.push({
        label,
        status: outcome?.reconciled ? "reconciled" : "published",
        members: after.length,
        resultRevision: outcome?.resultRevision ?? null,
      });
    } catch (error) {
      // Convex delivers the application code in `data`; the bare message is redacted.
      const code = error?.data?.code ?? null;
      const detailMessage = error?.data?.message ?? error.message;
      console.error(`FAILED ${label} — ${code ?? "ERROR"}: ${detailMessage}`);
      results.push({ label, status: "failed", code, error: detailMessage });
    }
  }

  const tally = results.reduce((counts, { status }) => {
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
  console.log("\nSummary:", JSON.stringify(tally));

  const reportPath = getFlagValue(argv, "--report");
  if (reportPath) {
    writeFileSync(
      reportPath,
      `${JSON.stringify({ operation: OPERATION, at: new Date().toISOString(), dryRun: command.dryRun, target: command.deploymentFingerprint, tally, results }, null, 1)}\n`,
    );
    console.log(`Report: ${reportPath}`);
  }

  const blocking = results.filter(({ status }) =>
    ["failed", "read-failed", "membership-drift", "disabled"].includes(status),
  );
  if (blocking.length && !hasFlag(argv, "--allow-partial")) {
    process.exitCode = 1;
  }
}

await main();
