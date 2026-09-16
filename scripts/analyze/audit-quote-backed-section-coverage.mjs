#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createDataClient } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts";
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";
import { normalizePharmacologySection } from "../../lib/article/normalization.mjs";

const DEFAULT_DEPLOYMENTS = {
  publicRead: process.env.SOURCE_POSTGRES_URL,
  editorDefault: process.env.TARGET_POSTGRES_URL,
};
if (!DEFAULT_DEPLOYMENTS.publicRead || !DEFAULT_DEPLOYMENTS.editorDefault) {
  throw new Error("Set SOURCE_POSTGRES_URL and TARGET_POSTGRES_URL explicitly for the comparison.");
}

const SECTIONS = [
  "summary",
  "pharmacology",
  "harm_potential",
  "history_culture",
  "legality",
  "tolerance",
  "dosage_duration",
];

const outputPath = process.argv.includes("--output")
  ? process.argv[process.argv.indexOf("--output") + 1]
  : "/tmp/quote-backed-missing-section-audit-current.json";
const publicQueuePath = process.argv.includes("--public-queue-output")
  ? process.argv[process.argv.indexOf("--public-queue-output") + 1]
  : "/tmp/public-missing-section-slugs.json";

function titleToSlug(title = "") {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getArticleSlug(article) {
  return article.slug || titleToSlug(article.title);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function hasDoseTier(route) {
  return route?.dose_ranges && Object.values(route.dose_ranges).some((tier) =>
    tier && (tier.min != null || tier.max != null || hasText(tier.note) || hasText(tier.notes)),
  );
}

function hasDurationStage(route) {
  return route?.stages && Object.values(route.stages).some((stage) =>
    stage && (stage.min != null || stage.max != null || hasText(stage.note) || hasText(stage.notes)),
  );
}

function hasSectionContent(article, section) {
  switch (section) {
    case "summary":
      return hasText(article.summary);
    case "pharmacology": {
      const pharmacology = normalizePharmacologySection(article.pharmacology);
      return hasText(pharmacology.summary) ||
        hasText(pharmacology.pharmacodynamics) ||
        hasText(pharmacology.pharmacokinetics) ||
        hasArray(pharmacology.binding_sites) ||
        hasArray(pharmacology.metabolites) ||
        Object.keys(pharmacology.route_bioavailability || {}).length > 0 ||
        Object.keys(pharmacology.route_half_life || {}).length > 0;
    }
    case "harm_potential": {
      const harm = article.harm_potential || {};
      return hasText(harm.addiction?.psychological?.description) ||
        hasText(harm.addiction?.physical_dependence?.description) ||
        hasText(harm.toxicity?.lethal_dosage?.notes) ||
        hasArray(harm.toxicity?.lethal_dosage?.ld50) ||
        hasArray(harm.toxicity?.ld50) ||
        hasArray(harm.toxicity?.organ_toxicity) ||
        hasText(harm.toxicity?.carcinogenicity?.description) ||
        hasText(harm.toxicity?.antibiotic_function?.description) ||
        hasText(harm.psychosis?.description) ||
        hasText(harm.seizure?.description) ||
        hasText(harm.addiction_liability) ||
        hasText(harm.dependence_liability) ||
        hasText(harm.risks?.psychosis?.description) ||
        hasText(harm.risks?.seizure?.description);
    }
    case "history_culture": {
      const history = article.history_culture || {};
      return hasText(history.content) ||
        (Array.isArray(history.sections) && history.sections.some((sectionEntry) => hasText(sectionEntry.content)));
    }
    case "legality": {
      const legality = article.legality || {};
      return (Array.isArray(legality.international) && legality.international.length > 0) ||
        Object.keys(legality.countries || {}).length > 0 ||
        hasText(legality.summary) ||
        hasText(legality.notes);
    }
    case "tolerance": {
      const tolerance = article.tolerance || {};
      return hasText(tolerance.full_tolerance) ||
        hasText(tolerance.half_tolerance) ||
        hasText(tolerance.baseline_tolerance) ||
        (Array.isArray(tolerance.cross_tolerance) && tolerance.cross_tolerance.length > 0);
    }
    case "dosage_duration":
      return (Array.isArray(article.dosage?.routes) && article.dosage.routes.some(hasDoseTier)) ||
        (Array.isArray(article.duration?.routes) && article.duration.routes.some(hasDurationStage));
    default:
      return false;
  }
}

function substantiveQuoteBody(content) {
  return String(content || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith(">") && !/^---+$/.test(line))
    .filter((line) => !/^##+\s*(source|note)\b/i.test(line))
    .filter((line) => !/^generated\s+\d{4}/i.test(line))
    .filter((line) => !/^\*?no [^*\n.]{0,180}(content|information|quotes)[^*\n]*found[^*\n]*\.?\*?$/i.test(line))
    .filter((line) => !/^\*?no relevant [^*\n]*found[^*\n]*\.?\*?$/i.test(line))
    .filter((line) => !/^\*?the available source articles do not contain[^*\n]*\.?\*?$/i.test(line))
    .join("\n")
    .trim();
}

function isSupportiveQuote(content) {
  return hasText(substantiveQuoteBody(content));
}

function localDosageQuote(slug) {
  const quotePath = join("quotes/dosage-duration-quotes", `${slug}-dosage-duration.md`);
  return existsSync(quotePath) ? readFileSync(quotePath, "utf8") : null;
}

async function auditDeployment(label, url) {
  const { client, fingerprint } = createDataClient({ target: url });
  const articles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);
  const quoteDocs = await client.query(api.quotes.getAll, {});
  const quoteContentByKey = new Map(
    quoteDocs.map((quote) => [`${quote.section}:${quote.slug}`, quote.content || ""]),
  );
  const missingBySection = Object.fromEntries(SECTIONS.map((section) => [section, []]));
  const unsupportedBySection = Object.fromEntries(SECTIONS.map((section) => [section, []]));
  const supportedCounts = Object.fromEntries(SECTIONS.map((section) => [section, 0]));

  for (const article of articles) {
    const slug = getArticleSlug(article);
    for (const section of SECTIONS) {
      const quoteContent = section === "dosage_duration"
        ? localDosageQuote(slug)
        : quoteContentByKey.get(`${section}:${slug}`);
      if (!quoteContent) continue;
      if (!isSupportiveQuote(quoteContent)) {
        unsupportedBySection[section].push(slug);
        continue;
      }
      supportedCounts[section] += 1;
      if (!hasSectionContent(article, section)) {
        missingBySection[section].push(slug);
      }
    }
  }

  const missingCounts = Object.fromEntries(
    SECTIONS.map((section) => [section, missingBySection[section].length]),
  );
  const unsupportedCounts = Object.fromEntries(
    SECTIONS.map((section) => [section, unsupportedBySection[section].length]),
  );

  console.log(`\n${label} ${fingerprint}`);
  console.log("missing", missingCounts);

  return {
    url: fingerprint,
    articleCount: articles.length,
    quoteDocCount: quoteDocs.length,
    supportedCounts,
    missingCounts,
    missingBySection,
    unsupportedCounts,
    unsupportedBySection,
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  deployments: {},
};

for (const [label, url] of Object.entries(DEFAULT_DEPLOYMENTS)) {
  report.deployments[label] = await auditDeployment(label, url);
}

writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(publicQueuePath, `${JSON.stringify(report.deployments.publicRead.missingBySection, null, 2)}\n`);
console.log(`\nwrote ${outputPath}`);
console.log(`wrote ${publicQueuePath}`);
