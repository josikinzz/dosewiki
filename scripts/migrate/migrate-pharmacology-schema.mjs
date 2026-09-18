#!/usr/bin/env node

import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  getAllSubstanceDocuments,
  getUniqueSubstanceDocumentBySlug,
} from "../lib/data-pagination.mjs";
import {
  normalizePharmacologySection,
  normalizeRouteName,
} from "../../lib/article/normalization.mjs";
import {
  createProductionWriteCommand,
  executeProductionWrite,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const chunkSize = 50;
const command = createProductionWriteCommand({
  operation: "migrate-pharmacology-schema",
  argv: args,
});

function getFlagValue(name) {
  const prefix = `${name}=`;
  return args.find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function requireReadUrl() {
  const sourceUrl =
    getFlagValue("--source-url") ??
    process.env.SOURCE_POSTGRES_URL ??
    process.env.SOURCE_POSTGRES_URL ??
    command.targetUrl;
  if (!sourceUrl) {
    throw new Error(
      "Dry-run requires --source-url or SOURCE_POSTGRES_URL; writes require TARGET_POSTGRES_URL or --target.",
    );
  }
  return sourceUrl;
}

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }
  if (!isRecord(value)) {
    return JSON.stringify(value);
  }

  const sortedKeys = Object.keys(value).sort();
  return `{${sortedKeys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

function stripTopLevelSystemFields(article) {
  const { _id, _creationTime, ...sanitized } = article;
  return sanitized;
}

function currentComparablePharmacology(rawPharmacology) {
  const pharmacology = isRecord(rawPharmacology) ? rawPharmacology : {};
  return normalizePharmacologySection({
    pharmacodynamics: pharmacology.pharmacodynamics,
    summary: pharmacology.summary,
    binding_sites: pharmacology.binding_sites,
    receptor_profile: pharmacology.receptor_profile,
    pharmacokinetics: pharmacology.pharmacokinetics,
    metabolites: pharmacology.metabolites,
    protein_binding: pharmacology.protein_binding,
    volume_of_distribution: pharmacology.volume_of_distribution,
    route_bioavailability: pharmacology.route_bioavailability,
    route_half_life: pharmacology.route_half_life,
    route_half_life_notes: pharmacology.route_half_life_notes,
    route_bioavailability_notes: pharmacology.route_bioavailability_notes,
    bioavailability_notes: pharmacology.bioavailability_notes,
    half_life: pharmacology.half_life,
  });
}

function hasLegacyPharmacologyFields(rawPharmacology) {
  const pharmacology = isRecord(rawPharmacology) ? rawPharmacology : {};
  return (
    Object.prototype.hasOwnProperty.call(pharmacology, "receptor_profile") ||
    (Array.isArray(pharmacology.mechanism_of_action) && pharmacology.mechanism_of_action.length > 0) ||
    (isRecord(pharmacology.receptor_binding) && Object.keys(pharmacology.receptor_binding).length > 0) ||
    (typeof pharmacology.metabolism === "string" && pharmacology.metabolism.trim().length > 0)
  );
}

function createBlankDosageRoute(routeName, bioavailability = "", bioavailabilityNotes = "") {
  return {
    route: routeName,
    bioavailability,
    bioavailability_notes: bioavailabilityNotes,
    dose_ranges: {
      threshold: { min: null, max: null, unit: "" },
      light: { min: null, max: null, unit: "" },
      moderate: { min: null, max: null, unit: "" },
      strong: { min: null, max: null, unit: "" },
      heavy: { min: null, max: null, unit: "" },
    },
    notes: "",
  };
}

function createBlankDurationRoute(routeName, halfLife = "", halfLifeNotes = "") {
  return {
    route: routeName,
    half_life: halfLife,
    half_life_notes: halfLifeNotes,
    stages: {
      onset: { min: null, max: null, unit: "" },
      come_up: { min: null, max: null, unit: "" },
      peak: { min: null, max: null, unit: "" },
      offset: { min: null, max: null, unit: "" },
      after_effects: { min: null, max: null, unit: "" },
      total_duration: { min: null, max: null, unit: "" },
    },
  };
}

function mergeRouteDataIntoArticle(article, pharmacology) {
  const routeBioMap = pharmacology.route_bioavailability ?? {};
  const routeHalfLifeMap = pharmacology.route_half_life ?? {};
  const routeHalfLifeNotesMap = pharmacology.route_half_life_notes ?? {};
  const routeBioNotesMap = pharmacology.route_bioavailability_notes ?? {};

  const currentDosageRoutes = Array.isArray(article.dosage?.routes) ? [...article.dosage.routes] : [];
  const currentDurationRoutes = Array.isArray(article.duration?.routes) ? [...article.duration.routes] : [];
  const existingRoutes = new Set(currentDosageRoutes.map((route) => normalizeRouteName(route.route)));

  currentDosageRoutes.forEach((route) => {
    const normalizedRoute = normalizeRouteName(route.route);
    if (routeBioMap[normalizedRoute]) {
      route.bioavailability = routeBioMap[normalizedRoute];
    }
    if (routeBioNotesMap[normalizedRoute]) {
      route.bioavailability_notes = routeBioNotesMap[normalizedRoute];
    }
  });

  currentDurationRoutes.forEach((route) => {
    const normalizedRoute = normalizeRouteName(route.route);
    if (routeHalfLifeMap[normalizedRoute]) {
      route.half_life = routeHalfLifeMap[normalizedRoute];
    }
    if (routeHalfLifeNotesMap[normalizedRoute]) {
      route.half_life_notes = routeHalfLifeNotesMap[normalizedRoute];
    }
  });

  const allRouteNames = new Set([
    ...Object.keys(routeBioMap),
    ...Object.keys(routeHalfLifeMap),
    ...Object.keys(routeHalfLifeNotesMap),
    ...Object.keys(routeBioNotesMap),
  ]);

  for (const routeName of allRouteNames) {
    if (existingRoutes.has(routeName)) {
      continue;
    }

    currentDosageRoutes.push(
      createBlankDosageRoute(routeName, routeBioMap[routeName] ?? "", routeBioNotesMap[routeName] ?? ""),
    );
    currentDurationRoutes.push(
      createBlankDurationRoute(routeName, routeHalfLifeMap[routeName] ?? "", routeHalfLifeNotesMap[routeName] ?? ""),
    );
  }

  return {
    ...article,
    dosage: {
      ...article.dosage,
      routes: currentDosageRoutes,
    },
    duration: {
      ...article.duration,
      routes: currentDurationRoutes,
    },
  };
}

function migrateArticle(article) {
  const normalizedPharmacology = normalizePharmacologySection(article.pharmacology);
  const updatedArticle = mergeRouteDataIntoArticle(
    {
      ...stripTopLevelSystemFields(article),
      pharmacology: normalizedPharmacology,
    },
    normalizedPharmacology,
  );

  return {
    article: updatedArticle,
    changed:
      hasLegacyPharmacologyFields(article.pharmacology) ||
      stableSerialize(currentComparablePharmacology(article.pharmacology)) !== stableSerialize(normalizedPharmacology),
  };
}

async function saveInChunks(client, apiKey, articles) {
  for (let index = 0; index < articles.length; index += chunkSize) {
    const chunk = articles.slice(index, index + chunkSize);
    await client.mutation(api.substanceIndex.saveSubstances, {
      apiKey,
      articles: chunk,
    });
    console.log(`Saved ${Math.min(index + chunk.length, articles.length)}/${articles.length}`);
  }
}

async function main() {
  console.log("\nPharmacology Schema Migration");
  console.log("=".repeat(50));
  printProductionWriteCommand(command);

  const onlySlug = getFlagValue("--slug");
  const sourceClient = createDataClient({ target: requireReadUrl() }).client;
  const targetedArticle = onlySlug
    ? await getUniqueSubstanceDocumentBySlug(
        sourceClient,
        api.substanceIndex.getFullDocumentPage,
        onlySlug,
      )
    : null;
  const articles = onlySlug
    ? targetedArticle ? [targetedArticle] : []
    : await getAllSubstanceDocuments(sourceClient, api.substanceIndex.getFullDocumentPage);
  if (onlySlug && articles.length === 0) {
    throw new Error(`No substance found for slug "${onlySlug}"`);
  }
  const migrations = articles.map(migrateArticle);
  const changed = migrations.filter((entry) => entry.changed);

  console.log(`Fetched ${articles.length} articles`);
  console.log(`${changed.length} articles require pharmacology normalization`);

  if (verbose) {
    for (const entry of changed.slice(0, 20)) {
      console.log(`- ${entry.article.title}`);
    }
  }

  if (changed.length === 0) {
    return;
  }

  if (command.dryRun) {
    console.log(
      "Dry run only. Write with --write --confirm-write=migrate-pharmacology-schema " +
        "--expected-deployment=<deployment-name> and an explicit target.",
    );
    return;
  }

  await executeProductionWrite(command, async () => {
    const credential = requireProductionWriteCredential("editorArticleWrite");
    const targetClient = createDataClient({ target: command.targetUrl }).client;
    await saveInChunks(
      targetClient,
      credential.token,
      changed.map((entry) => entry.article),
    );

    const refreshedArticle = onlySlug
      ? await getUniqueSubstanceDocumentBySlug(
          targetClient,
          api.substanceIndex.getFullDocumentPage,
          onlySlug,
        )
      : null;
    const refreshed = onlySlug
      ? refreshedArticle ? [refreshedArticle] : []
      : await getAllSubstanceDocuments(targetClient, api.substanceIndex.getFullDocumentPage);
    const remaining = refreshed.filter((article) => migrateArticle(article).changed);
    console.log(`Remaining articles needing migration: ${remaining.length}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
