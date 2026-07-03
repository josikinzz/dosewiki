#!/usr/bin/env node
/**
 * Generate the subjective-effects licensing provenance manifest from live Convex data.
 *
 * Queries every substance's `subjective_effects.attribution` field, keeps only
 * captures dose.wiki treats as Josie Kins' own archived PsychonautWiki
 * authorship (mirrors `isArchivedSubjectiveEffectsAttribution` in
 * src/features/article/components/sections/SubjectiveEffectsSection.tsx),
 * buckets them by Archive.org capture date, and writes:
 *
 *   - src/data/generated/subjectiveEffectsProvenance.json (imported by the
 *     /docs/license page for its date-badge counts)
 *   - public/subjective-effects-provenance.json (same content, served as a
 *     downloadable manifest with clickable Archive.org capture links)
 *
 * Usage:
 *   npm run generate:subjective-effects-provenance
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireSourceUrl,
} from "../lib/data-ops-run-context.mjs";
import { tryWriteArtifactLineageSidecar } from "../lib/data-artifact-lineage.mjs";

// The rights boundary described on /docs/license: only PsychonautWiki
// captures on or before this date are treated as restorable.
const CUTOFF_DATE = "2016-08-31";

const runContext = createDataOpsRunContext({
  operation: "generate subjective-effects provenance manifest",
  intent: "local-export",
  sourceUrlKeys: [
    "SOURCE_CONVEX_URL",
    "TARGET_CONVEX_URL",
    "CONVEX_PUBLIC_READ_URL",
    "VITE_CONVEX_URL",
    "CONVEX_URL",
    "NEXT_PUBLIC_CONVEX_URL",
  ],
  targetUrlKeys: [],
  localArtifacts: [
    "src/data/generated/subjectiveEffectsProvenance.json",
    "public/subjective-effects-provenance.json",
  ],
});

let convexUrl;
try {
  convexUrl = requireSourceUrl(runContext, "Convex source URL");
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}

function isArchivedAttribution(attribution) {
  return (
    !!attribution &&
    attribution.author === "Josie Kins" &&
    typeof attribution.url === "string" &&
    attribution.url.startsWith("https://web.archive.org/web/")
  );
}

function parseCaptureDate(url) {
  const match = url.match(/\/web\/(\d{4})(\d{2})(\d{2})\d{6}\//);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

function bucketFor(captureDate) {
  if (!captureDate) {
    return "undated";
  }
  if (captureDate > CUTOFF_DATE) {
    return "outside-boundary";
  }
  const year = Number(captureDate.slice(0, 4));
  const yearMonth = captureDate.slice(0, 7);
  if (year <= 2015) {
    return "2015-or-earlier";
  }
  if (yearMonth >= "2016-01" && yearMonth <= "2016-07") {
    return "jan-jul-2016";
  }
  return "august-2016";
}

const IN_BOUNDARY_SEGMENTS = [
  { key: "2015-or-earlier", label: "2015 or earlier", detail: "Earliest recovered sections" },
  { key: "jan-jul-2016", label: "Jan-Jul 2016", detail: "Still before August" },
  { key: "august-2016", label: "August 2016", detail: "Latest included captures" },
];

function formatPercent(count, total) {
  return total === 0 ? "0.0%" : `${((count / total) * 100).toFixed(1)}%`;
}

async function main() {
  console.log("Generating subjective-effects provenance manifest from Convex\n");
  printDataOpsRunContext(runContext);
  console.log("");

  const client = new ConvexHttpClient(convexUrl);
  const substances = await client.query(api.substanceIndex.getAll, {});

  if (!substances || substances.length === 0) {
    console.error("❌ No substances found in the source Convex deployment.");
    process.exit(1);
  }

  console.log(`Fetched ${substances.length} substances\n`);

  const entries = [];
  for (const substance of substances) {
    const attribution = substance.subjective_effects?.attribution;
    if (!isArchivedAttribution(attribution)) {
      continue;
    }

    const captureDate = parseCaptureDate(attribution.url);
    entries.push({
      slug: substance.slug ?? null,
      title: substance.title ?? null,
      captureUrl: attribution.url,
      captureDate,
      bucket: bucketFor(captureDate),
    });
  }

  entries.sort(
    (a, b) =>
      (a.captureDate ?? "").localeCompare(b.captureDate ?? "") ||
      String(a.slug ?? "").localeCompare(String(b.slug ?? "")),
  );

  const flagged = entries.filter((entry) => entry.bucket === "outside-boundary" || entry.bucket === "undated");
  if (flagged.length > 0) {
    console.warn(
      `⚠️  ${flagged.length} archived attribution(s) fall outside the ${CUTOFF_DATE} rights boundary or have an unparseable capture date and are excluded from the licensed count:`,
    );
    for (const entry of flagged) {
      console.warn(`   - ${entry.slug ?? "(unknown slug)"}: ${entry.captureUrl}`);
    }
  }

  const counts = Object.fromEntries(IN_BOUNDARY_SEGMENTS.map((segment) => [segment.key, 0]));
  for (const entry of entries) {
    if (counts[entry.bucket] !== undefined) {
      counts[entry.bucket] += 1;
    }
  }

  const inBoundaryTotal = IN_BOUNDARY_SEGMENTS.reduce((sum, segment) => sum + counts[segment.key], 0);

  const manifest = {
    generatedAt: new Date().toISOString(),
    description:
      "Archive.org capture links behind the /docs/license subjective-effects provenance section. Includes every substance whose subjective-effects text dose.wiki restored from a PsychonautWiki capture credited to Josie Kins, plus any captures excluded for falling outside the rights boundary.",
    cutoffDate: CUTOFF_DATE,
    inBoundaryTotal,
    summary: {
      segments: IN_BOUNDARY_SEGMENTS.map((segment) => ({
        ...segment,
        count: counts[segment.key],
        percent: formatPercent(counts[segment.key], inBoundaryTotal),
      })),
    },
    entries,
  };

  const repoRoot = runContext.repoRoot;
  const generatedPath = resolve(repoRoot, "src/data/generated/subjectiveEffectsProvenance.json");
  const publicPath = resolve(repoRoot, "public/subjective-effects-provenance.json");
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

  mkdirSync(dirname(generatedPath), { recursive: true });
  writeFileSync(generatedPath, serialized);
  writeFileSync(publicPath, serialized);

  const lineage = tryWriteArtifactLineageSidecar({
    artifactPath: generatedPath,
    sourceDeployment: "CONVEX_PUBLIC_READ_URL",
    schemaVersion: "src/schema/substance/subjective-effects.ts",
    extra: {
      inBoundaryTotal,
      excludedCount: flagged.length,
      convexUrlLabel: runContext.sourceUrlKey,
    },
  });

  console.log(`✅ Wrote ${generatedPath}`);
  console.log(`✅ Wrote ${publicPath}`);
  if (lineage) {
    console.log(`🧾 Lineage metadata written to ${lineage.outputPath}`);
  }
  console.log(`\nIn-boundary total: ${inBoundaryTotal}`);
  for (const segment of manifest.summary.segments) {
    console.log(`  ${segment.label}: ${segment.count}/${inBoundaryTotal} (${segment.percent})`);
  }
}

main().catch((error) => {
  console.error("❌ Provenance manifest generation failed:", error);
  process.exit(1);
});
