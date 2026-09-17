#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const INDEX_PATH = `${ROOT}/data/substances/psychoactiveIndexManual.json`;
const ARTICLES_PATH = `${ROOT}/public/SubstanceIndex.json`;

const CLASS_MATCHERS = {
  "2c-x": [/^2c-x$/],
  amphetamine: [/^amphetamine$/],
  arylcyclohexylamine: [/^arylcyclohexylamine$/],
  benzodiazepines: [/^benzodiazepine/],
  "fentanyl-analogue": [/fentanyl/, /anilidopiperidine/],
  lysergamide: [/^lysergamide$/],
  morphinan: [/^morphinan/],
  scaline: [/^scaline$/],
  tryptamine: [/^tryptamine$/],
};

const normalize = (value) => value.trim().toLowerCase();
const isCommonSection = (section) => [section.key, section.label].some(
  (value) => ["common", "general"].includes(normalize(value)),
);
const isFallbackSection = (section) => section.key.startsWith("other-");

const [index, articles] = await Promise.all([
  readFile(INDEX_PATH, "utf8").then(JSON.parse),
  readFile(ARTICLES_PATH, "utf8").then(JSON.parse),
]);
const articleBySlug = new Map(articles.map((article) => [article.slug, article]));
const findings = [];
let checked = 0;

for (const category of index.categories) {
  const common = category.sections.find(isCommonSection);
  if (!common) continue;

  const namedSections = category.sections.filter((section) => !isCommonSection(section));
  for (const slug of common.drugs) {
    checked += 1;
    const placements = namedSections.filter((section) => section.drugs.includes(slug));
    if (placements.length === 0) {
      findings.push(`${category.key}/${slug}: missing named class placement`);
      continue;
    }

    const article = articleBySlug.get(slug);
    if (!article) {
      findings.push(`${category.key}/${slug}: missing article record`);
      continue;
    }
    const chemicalClasses = (article.classification?.chemical_class ?? []).map(normalize);
    const supported = placements.some((section) => {
      if (isFallbackSection(section)) return true;
      const matchers = CLASS_MATCHERS[section.key];
      return matchers?.some((matcher) => chemicalClasses.some((name) => matcher.test(name))) ?? false;
    });
    if (!supported) {
      findings.push(
        `${category.key}/${slug}: ${placements.map((section) => section.key).join(", ")} not supported by chemical classes [${chemicalClasses.join(", ")}]`,
      );
    }
  }
}

if (findings.length > 0) {
  console.error(`Common membership audit failed (${findings.length}/${checked}):`);
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exitCode = 1;
} else {
  console.log(`Common membership audit passed: ${checked} substances have supported named placements.`);
}
