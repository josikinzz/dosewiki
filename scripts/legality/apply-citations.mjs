#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { createDataClient } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts"
import {
  buildCitationPromotionPlan,
  applyCitationPromotionPlan,
} from "../citations/citation-promotion-applicator.mjs";
import {
  getReferenceIdentityKeys,
  haveCompatibleReferenceIdentity,
  mergeReferenceMetadata,
  referenceDedupeKey,
} from "../../lib/citations/referenceIdentity.mjs";
import { assertDataOpsWriteAllowed,
backupBeforeWrite,
createDataOpsRunContext,
getFlagValue,
requireAdminIntentToken,
requireTargetUrl,  } from "../lib/data-ops-run-context.mjs"; import { updateAuditLog, writeAuditLog } from "../lib/data-ops-audit.mjs"

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stripDataMetadata(article) {
  const { _id, _creationTime, ...clean } = article;
  return clean;
}

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "source";
}

function sourceHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "source";
  }
}

function stableSuffix(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
  }
  return Math.abs(hash).toString(16).padStart(6, "0").slice(0, 6);
}

function referenceIdForSource(source, instrument) {
  return `${slugify(sourceHost(source.url))}-${slugify(instrument)}`;
}

function referenceKeys(reference) {
  const identityKeys = getReferenceIdentityKeys(reference);
  return identityKeys.length > 0 ? identityKeys : [referenceDedupeKey(reference)];
}

function equivalentReference(reference, referencesByKey) {
  for (const key of referenceKeys(reference)) {
    const match = referencesByKey.get(key);
    if (match && haveCompatibleReferenceIdentity(match, reference)) return match;
  }
  return null;
}

function rememberReference(reference, referencesByKey) {
  for (const key of referenceKeys(reference)) {
    referencesByKey.set(key, reference);
  }
}

function recordSourceJurisdictions(draft) {
  const jurisdictions = [];
  const countries = new Map();
  for (const [section, entries] of [
    ["entries", draft.entries ?? {}],
    ["corrections", draft.corrections ?? {}],
    ["enrichments", draft.enrichments ?? {}],
  ]) {
    for (const [country, entry] of Object.entries(entries)) {
      if (!Array.isArray(entry.sources) || entry.sources.length === 0) continue;
      const current = countries.get(country) ?? { sources: [], claim: null };
      current.sources.push(...entry.sources.map((source) => ({ source, entry, section })));
      // This order mirrors apply-draft: enrichments are applied after corrections.
      current.claim = entry;
      countries.set(country, current);
    }
  }
  for (const [country, sourceData] of countries) {
    jurisdictions.push({
      ...sourceData,
      country,
      displayName: country,
      fieldPath: `legality.countries.${country}.instrument`,
      claimKey: `legality:legality.countries.${slugify(country)}.instrument`,
      getLiveEntry: (legality) => legality.countries?.[country],
      setLiveEntry: (legality, entry) => {
        legality.countries[country] = entry;
      },
    });
  }

  for (const [state, entry] of Object.entries(draft.usStates ?? {})) {
    jurisdictions.push({
      sources: entry.sources ?? [],
      claim: entry,
      country: state,
      displayName: `${state} (US state)`,
      fieldPath: `legality.usStates.${state}.instrument`,
      claimKey: `legality:legality.usStates.${slugify(state)}.instrument`,
      getLiveEntry: (legality) => legality.usStates?.[state],
      setLiveEntry: (legality, liveEntry) => {
        legality.usStates[state] = liveEntry;
      },
    });
    for (const [city, cityEntry] of Object.entries(entry.cities ?? {})) {
      jurisdictions.push({
        sources: cityEntry.sources ?? [],
        claim: cityEntry,
        country: state,
        displayName: `${city}, ${state} (US city)`,
        fieldPath: `legality.usStates.${state}.cities.${city}.instrument`,
        claimKey: `legality:legality.usStates.${slugify(state)}.cities.${slugify(city)}.instrument`,
        getLiveEntry: (legality) => legality.usStates?.[state]?.cities?.[city],
        setLiveEntry: (legality, liveEntry) => {
          legality.usStates[state].cities[city] = liveEntry;
        },
      });
    }
  }

  return jurisdictions;
}

function markerString(referenceIds) {
  return referenceIds.map((referenceId) => `[cite:${referenceId}]`).join("");
}

function evidenceForSource({ country, displayName, fieldPath, claimKey, claim, source, referenceId }) {
  const quote = source.supportQuote.trim();
  if (!quote) return null;
  const rationale = `Supports the ${displayName} legality status: ${claim.canonicalStatus}, ${claim.instrument}.`;
  const sourceName = source.title.trim();
  const sourceId = referenceId;
  return {
    section: "legality",
    claimKey,
    claimText: claim.instrument,
    fieldPath,
    referenceIds: [referenceId],
    sourceName,
    sourceType: "unknown",
    quality: "fallback",
    status: "supported",
    severity: "non_blocking",
    entailmentVerdict: "entails",
    confidence: 0.85,
    supportingSnippet: quote,
    supportRationale: rationale,
    supports: [{
      sourceId,
      sourceName,
      referenceId,
      sourceType: "unknown",
      quality: "fallback",
      supportingQuote: quote,
      rationale,
      verifiedQuote: {
        sourceId,
        matchType: "normalized_whitespace",
        startOffset: null,
        endOffset: null,
      },
    }],
    diagnostics: [],
    provenance: {
      source: "dosewiki-legality-draft",
      country,
      adapter: "scripts/legality/apply-citations.mjs",
    },
  };
}

export function buildLegalityCitationPlan({ article, draft }) {
  const articleForCitation = structuredClone(stripDataMetadata(article));
  const existingReferences = Array.isArray(articleForCitation.references) ? articleForCitation.references : [];
  const references = [...existingReferences];
  const referencesByKey = new Map();
  const referencesById = new Map();
  for (const reference of existingReferences) {
    if (!reference?.id) continue;
    rememberReference(reference, referencesByKey);
    referencesById.set(reference.id, reference);
  }

  const evidence = [];
  const countries = [];
  const nextLegality = structuredClone(articleForCitation.legality ?? {});
  const nextCountries = isRecord(nextLegality.countries) ? nextLegality.countries : {};
  nextLegality.countries = nextCountries;

  for (const jurisdiction of recordSourceJurisdictions(draft)) {
    const { country, displayName, fieldPath, claimKey } = jurisdiction;
    const liveEntry = jurisdiction.getLiveEntry(nextLegality);
    if (!isRecord(liveEntry)) {
      throw new Error(`Cannot cite ${displayName}: the live article has no matching legality entry. Apply the legality draft first.`);
    }

    const referenceIds = [];
    const referenceKinds = new Map();
    const evidenceReferenceIds = new Set();
    for (const sourceData of jurisdiction.sources) {
      const source = sourceData.source ?? sourceData;
      const entry = sourceData.entry ?? jurisdiction.claim;
      const candidate = {
        id: referenceIdForSource(source, entry.instrument),
        type: "webpage",
        template: "cite_web",
        title: source.title,
        authors: [],
        url: source.url,
        siteName: sourceHost(source.url),
        publisher: sourceHost(source.url),
        ...(source.supportQuote.trim() ? { supportStatus: "inspected" } : {}),
        metadataProvenance: [{
          kind: "inspected",
          source: "legality-citation-workflow",
          fields: ["title", "siteName", "url", "accessedAt", "supportStatus"],
        }],
      };
      let reference = equivalentReference(candidate, referencesByKey);
      let kind = "reused";
      if (reference) {
        const merged = mergeReferenceMetadata(reference, candidate, {
          allowTrustedScalarOverride: true,
        });
        const referenceIndex = references.findIndex((entry) => entry === reference || entry?.id === reference.id);
        if (referenceIndex >= 0) references[referenceIndex] = merged;
        referencesById.set(merged.id, merged);
        rememberReference(merged, referencesByKey);
        reference = merged;
      } else {
        let id = candidate.id;
        const collision = referencesById.get(id);
        if (collision) {
          id = `${id}-${stableSuffix(source.url)}`;
        }
        reference = { ...candidate, id };
        references.push(reference);
        rememberReference(reference, referencesByKey);
        referencesById.set(reference.id, reference);
        kind = "new";
      }
      if (!referenceIds.includes(reference.id)) {
        referenceIds.push(reference.id);
        referenceKinds.set(reference.id, kind);
      }

      if (!evidenceReferenceIds.has(reference.id)) {
        const row = evidenceForSource({
          country,
          displayName,
          fieldPath,
          claimKey,
          claim: jurisdiction.claim,
          source,
          referenceId: reference.id,
        });
        if (row) {
          evidence.push(row);
          evidenceReferenceIds.add(reference.id);
        }
      }
    }

    const markers = markerString(referenceIds);
    // Canonicalize: strip every existing [cite:...] token, then append the
    // desired marker set once — reruns and instrument-text edits converge
    // instead of stacking marker clusters.
    const before = liveEntry.instrument;
    const stripped = before.replace(/\s*\[cite:[^\]]+\]/g, "").trimEnd();
    const after = `${stripped} ${markers}`;
    const alreadyMarked = liveEntry.instrument === after;
    if (!alreadyMarked) {
      jurisdiction.setLiveEntry(nextLegality, { ...liveEntry, instrument: after });
    }
    countries.push({
      country: displayName,
      referenceIds,
      referenceKinds: Object.fromEntries(referenceKinds),
      evidenceRows: evidence.filter((row) => row.claimKey === claimKey).length,
      marker: markers,
      before,
      after,
      alreadyMarked,
    });
  }

  articleForCitation.references = references.sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const articleForMarker = {
    ...articleForCitation,
    legality: {
      ...nextLegality,
      countries: nextCountries,
    },
  };
  const changes = JSON.stringify(existingReferences) === JSON.stringify(articleForCitation.references)
    ? []
    : [{ path: "references", before: existingReferences, after: articleForCitation.references }];
  const promotionPlan = buildCitationPromotionPlan({
    source: "legality",
    slug: article.slug,
    title: article.title,
    article: articleForCitation,
    evidence,
    changes,
    references: articleForCitation.references,
    summary: {
      countries: countries.length,
      markersAdded: countries.filter((country) => !country.alreadyMarked).length,
    },
  });

  return { promotionPlan, articleForMarker, countries };
}

function validateDraft(runDir, repoRoot, draftFile) {
  const args = ["scripts/legality/validate-draft.ts", "--run", runDir];
  if (draftFile !== "legality-draft.json") {
    args.push("--draft-file", draftFile);
  }
  const result = spawnSync("bun", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.error) throw new Error(`Unable to run legality draft validation: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Legality draft validation failed.\n${result.stdout}${result.stderr}`.trim());
}

function printPlan(countries) {
  for (const country of countries) {
    const references = country.referenceIds.map((referenceId) => (
      `${referenceId} (${country.referenceKinds[referenceId]})`
    )).join(", ");
    console.log(`${country.country}: ${references || "no references"}; evidence ${country.evidenceRows}; marker ${country.alreadyMarked ? "unchanged" : `${country.before} → ${country.after}`}`);
  }
}

function requireSlug(argv) {
  const slug = getFlagValue(argv, "--slug")?.trim();
  if (!slug) throw new Error("--slug=<slug> is required.");
  return slug;
}

async function main() {
  const argv = process.argv.slice(2);
  const slug = requireSlug(argv);
  const write = argv.includes("--write");
  if (write && argv.includes("--dry-run")) throw new Error("Use either --dry-run or --write, not both.");

  const draftFile = getFlagValue(argv, "--draft-file")?.trim() || "legality-draft.json";
  const existingBackupPath = getFlagValue(argv, "--existing-backup")?.trim() || null;

  const runContext = createDataOpsRunContext({
    operation: "apply legality citations",
    intent: "legality-research",
    argv,
    sourceUrlKeys: [],
    dryRunFlag: "--dry-run",
    executeFlag: "--write",
    requiresExecute: true,
    confirmationFlag: "--confirm-legality-write",
    selectedTables: ["substanceIndex", "citationEvidence"],
    localArtifacts: [resolve("runs", "legality", slug, draftFile)],
    destructive: true,
  });
  if (!write) {
    runContext.dryRun = true;
    runContext.writeEnabled = false;
  }

  const runDir = resolve(runContext.repoRoot, "runs", "legality", slug);
  const draftPath = resolve(runDir, draftFile);
  if (!existsSync(draftPath)) throw new Error(`Missing legality draft: ${draftPath}`);
  validateDraft(runDir, runContext.repoRoot, draftFile);
  const draft = JSON.parse(readFileSync(draftPath, "utf8"));
  if (draft.slug !== slug) throw new Error(`Draft slug ${draft.slug} does not match --slug=${slug}.`);

  const targetUrl = requireTargetUrl(runContext, "Postgres legality target URL");
  const client = createDataClient({ target: targetUrl }).client;
  const article = await client.query(api.substanceIndex.getBySlug, { slug });
  if (!article) throw new Error(`No article found for slug: ${slug}`);

  const plan = buildLegalityCitationPlan({ article, draft });
  printPlan(plan.countries);
  if (!write) {
    console.log("No writes performed. Re-run with --write --confirm-legality-write to update Postgres.");
    return;
  }

  assertDataOpsWriteAllowed(runContext);
  const citationToken = requireAdminIntentToken("citationEvidenceWrite");
  const articleToken = requireAdminIntentToken("editorArticleWrite");
  const { path: auditLogPath } = writeAuditLog({
    operation: "legality-citation-apply",
    intent: "citationEvidenceWrite",
    slug,
    mutations: [
      { action: "apply", field: "references and citationEvidence" },
      ...plan.countries.filter((country) => !country.alreadyMarked).map((country) => ({
        country: country.country,
        action: "append_markers",
        field: "legality.countries.*.instrument",
      })),
    ],
    repoRoot: runContext.repoRoot,
  });
  const { path: backupPath, documentCount, reused: reusedBackup } = await backupBeforeWrite({
    sourceClient: client,
    queryGetAll: api.substanceIndex.getBySlug,
    queryArgs: { slug },
    label: `legality-citations-${slug}`,
    existingBackupPath,
    repoRoot: runContext.repoRoot,
  });

  const citationResult = await applyCitationPromotionPlan({
    client,
    apiKey: citationToken.token,
    plan: plan.promotionPlan,
  });
  const markerResult = await client.mutation(api.substanceIndex.saveSubstance, {
    apiKey: articleToken.token,
    article: plan.articleForMarker,
  });
  if (markerResult?.updated !== true || markerResult?.outcome?.action !== "updated") {
    throw new Error(`Legality marker write did not update ${slug}: ${JSON.stringify(markerResult)}`);
  }

  const appliedFile = draftFile === "legality-draft.json"
    ? "citations-applied.json"
    : draftFile.replace(/\.json$/, "-citations-applied.json");
  const appliedPath = resolve(runDir, appliedFile);
  writeFileSync(appliedPath, `${JSON.stringify({
    slug,
    appliedAt: new Date().toISOString(),
    countries: plan.countries.map(({ country, referenceIds, evidenceRows, marker, alreadyMarked }) => ({
      country,
      referenceIds,
      evidenceRows,
      marker,
      alreadyMarked,
    })),
  }, null, 2)}\n`);
  updateAuditLog(auditLogPath, {
    status: "completed",
    backupPath,
    citationResult,
    markerResult,
    appliedPath,
  });
  console.log(`Applied legality citations for ${slug}: ${plan.countries.length} countries, ${plan.promotionPlan.evidence.length} evidence rows.`);
  const backupSummary = reusedBackup ? "reused verified snapshot" : `${documentCount} documents`;
  console.log(`Backup: ${backupPath} (${backupSummary}); audit: ${auditLogPath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
