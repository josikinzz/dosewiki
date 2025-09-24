#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const TARGET_NAME = "alpha-Methyltryptamine (AMT)";
const TARGET_MECHANISM = "Serotonergic psychedelic, serotonin reuptake inhibitor";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../");
const dataPath = path.resolve(root, "src/data/articles.json");

const articles = JSON.parse(fs.readFileSync(dataPath, "utf8"));

let updated = false;

articles.forEach((article) => {
  const info = article?.drug_info;
  if (!info) return;
  const name = info.drug_name ?? article.title;
  if (name !== TARGET_NAME) return;
  if (info.mechanism_of_action === TARGET_MECHANISM) return;
  info.mechanism_of_action = TARGET_MECHANISM;
  updated = true;
});

if (updated) {
  fs.writeFileSync(dataPath, `${JSON.stringify(articles, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({ updated }, null, 2));
