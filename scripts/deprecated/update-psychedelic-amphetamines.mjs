#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const TARGET_CHEMICAL_CLASS = "Psychedelic amphetamine";
const TARGET_PSYCHOACTIVE_CLASS = "Psychedelic, stimulant";
const TARGET_MECHANISM = "Serotonergic agonist, dopamine reuptake inhibitor or releasor";

const RAW_NAMES = `
2,5-Dimethoxy-4-ethoxyamphetamine (MEM)
3C-E (3,5-dimethoxy-4-ethoxy-amphetamine)
3C-P (4-propoxy-3,5-dimethoxyamphetamine)
ALEPH
ALEPH-2 (2,5-Dimethoxy-4-ethylthioamphetamine)
ALEPH-6 (2,5-Dimethoxy-4-phenylthioamphetamine)
ARIADNE (4C-D, Dimoxamine, 4C-DOM, BL-3912)
Bromo-DragonFLY
DOB (2,5-Dimethoxy-4-bromoamphetamine)
DOC (2,5-Dimethoxy-4-chloroamphetamine)
DOEF
DOET
DOM (2,5-Dimethoxy-4-methylamphetamine)
TMA (3,4,5-Trimethoxyamphetamine)
TMA-2 (2,4,5-Trimethoxyamphetamine)
`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../");
const dataPath = path.resolve(root, "src/data/articles.json");

const normalize = (value) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();

const names = Array.from(
  new Set(
    RAW_NAMES.split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  ),
);

const targets = new Set(names.map(normalize));

if (targets.size === 0) {
  throw new Error("No target names loaded");
}

if (!fs.existsSync(dataPath)) {
  throw new Error(`Missing data file at ${dataPath}`);
}

const articles = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const updated = [];

articles.forEach((article) => {
  const info = article?.drug_info;
  if (!info) return;
  const name = info.drug_name ?? article.title;
  if (!name) return;
  if (!targets.has(normalize(name))) return;

  let changed = false;
  if (info.chemical_class !== TARGET_CHEMICAL_CLASS) {
    info.chemical_class = TARGET_CHEMICAL_CLASS;
    changed = true;
  }
  if (info.psychoactive_class !== TARGET_PSYCHOACTIVE_CLASS) {
    info.psychoactive_class = TARGET_PSYCHOACTIVE_CLASS;
    changed = true;
  }
  if (info.mechanism_of_action !== TARGET_MECHANISM) {
    info.mechanism_of_action = TARGET_MECHANISM;
    changed = true;
  }
  if (changed) {
    updated.push(name);
  }
});

if (updated.length > 0) {
  fs.writeFileSync(dataPath, `${JSON.stringify(articles, null, 2)}\n`, "utf8");
}

console.log(
  JSON.stringify(
    {
      targetCount: targets.size,
      updatedCount: updated.length,
      updatedNames: updated,
    },
    null,
    2,
  ),
);
