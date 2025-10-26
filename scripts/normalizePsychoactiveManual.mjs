import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = resolve(__dirname, "..");
const MANUAL_PATH = resolve(ROOT, "src/data/psychoactiveIndexManual.json");
const ARTICLES_PATH = resolve(ROOT, "src/data/articles.json");

const COMMON_TAG = "common";

const normalizeKey = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();

const cleanString = (value) => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const slugifyDrugName = (name, fallback) => {
  const normalized = normalizeKey(name);
  if (normalized) {
    return normalized;
  }
  return normalizeKey(fallback) || "article";
};

const tokenizeIndexCategories = (value) => {
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(/[;,/]/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const main = async () => {
  const articles = await readJson(ARTICLES_PATH);
  const slugNameMap = new Map();
  const commonSlugSet = new Set();

  for (const article of articles) {
    const info = article?.drug_info;
    if (!info) {
      continue;
    }

    const drugName = cleanString(info.drug_name);
    const titleName = cleanString(article.title);
    const substitutiveName = cleanString(info.substitutive_name);
    const iupacName = cleanString(info.IUPAC_name);
    const botanicalName = cleanString(info.botanical_name);

    const candidateNames = [drugName, titleName, substitutiveName, iupacName, botanicalName].filter(Boolean);
    if (candidateNames.length === 0) {
      continue;
    }

    const preferredName = candidateNames.find((value) => !value.includes("("));
    const baseName = preferredName ?? candidateNames[0];

    const id = typeof article.id === "number" ? article.id : null;
    const fallback = id !== null ? `article-${id}` : baseName;
    const slug = slugifyDrugName(baseName, fallback);

    slugNameMap.set(slug, baseName);

    const categoryList = Array.isArray(info.categories) ? info.categories : [];
    const hasCommonCategory = categoryList.some((entry) => normalizeKey(entry) === COMMON_TAG);

    const indexCategories = tokenizeIndexCategories(article["index-category"]);
    const hasCommonIndex = indexCategories.some((entry) => normalizeKey(entry) === COMMON_TAG);

    if (hasCommonCategory || hasCommonIndex) {
      commonSlugSet.add(slug);
    }
  }

  const manual = await readJson(MANUAL_PATH);

  const sortSlugs = (slugs = []) =>
    [...slugs]
      .map((slug) => ({
        slug,
        isCommon: commonSlugSet.has(slug),
        name: slugNameMap.get(slug) ?? slug,
      }))
      .sort((a, b) => {
        if (a.isCommon !== b.isCommon) {
          return a.isCommon ? -1 : 1;
        }
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      })
      .map((entry) => entry.slug);

  const nextManual = {
    ...manual,
    categories: manual.categories.map((category) => ({
      ...category,
      drugs: sortSlugs(category.drugs),
      sections: category.sections.map((section) => ({
        ...section,
        drugs: sortSlugs(section.drugs),
      })),
    })),
  };

  await writeFile(MANUAL_PATH, `${JSON.stringify(nextManual, null, 2)}\n`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
