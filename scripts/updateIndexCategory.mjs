import { readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const articlesPath = resolve(__dirname, "../src/data/articles.json");

const desiredInfoOrder = [
  "drug_name",
  "substitutive_name",
  "IUPAC_name",
  "botanical_name",
  "alternative_name",
  "chemical_class",
  "mechanism_of_action",
  "psychoactive_class",
  "dosages",
  "duration",
  "addiction_potential",
  "interactions",
  "notes",
  "subjective_effects",
  "tolerance",
  "half_life",
  "citations",
  "categories",
];

const raw = readFileSync(articlesPath, "utf8");
const articles = JSON.parse(raw);

const updated = articles.map((article) => {
  const { drug_info: info = {}, index_category, ...rest } = article;
  const existingHyphen = Object.prototype.hasOwnProperty.call(article, "index-category")
    ? article["index-category"]
    : undefined;
  const nextInfo = {};

  desiredInfoOrder.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(info, key)) {
      nextInfo[key] = info[key];
    }
  });

  Object.keys(info).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(nextInfo, key)) {
      nextInfo[key] = info[key];
    }
  });

  const normalizedIndexCategory =
    typeof existingHyphen === "string"
      ? existingHyphen
      : typeof index_category === "string"
        ? index_category
        : "";

  return {
    ...rest,
    drug_info: nextInfo,
    "index-category": normalizedIndexCategory ?? "",
  };
});

writeFileSync(articlesPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");

console.log(`Updated ${updated.length} articles.`);
