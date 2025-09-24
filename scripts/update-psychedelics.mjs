#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const TARGET_PSYCHOACTIVE_CLASS = "Psychedelic";
const TARGET_MECHANISM = "Serotonergic agonist";

const RAW_ALIASES = `
LSD
LSD (Lysergic acid diethylamide)
Mescaline
DMT
DMT (Dimethyltryptamine)
2C-B
AL-LAD
LSZ
1B-LSD
1cP-AL-LAD
1cP-LSD
1cP-MiPLA
1D-LSD
1P-ETH-LAD
1P-LSD
1S-LSD
Ibogaine
DiPT (N,N-Diisopropyltryptamine)
DPT (N,N-Dipropyltryptamine)
2-Me-DMT (2-Methyl-N,N-dimethyltryptamine, 2,N,N-TMT)
2-MeO-DMT
4-AcO-DET
4-AcO-DMT (O-Acetylpsilocin)
4-AcO-DPT
4-HO-McPT
4-HO-MET
4-HO-PiPT
4-MeO-MiPT
4-PrO-DMT
4-PrO-MET (4-propionoxy-4-HO-MET prodrug)
5-Bromo-DMT
5-Cl-AMT
Bufotenin
5-HO-DMT (Bufotenin)
5-MeO-AMT
5-MeO-DALT
5-MeO-DiBF (5-Methoxy-diisopropylbenzofuranethylamine)
5-MeO-DMT
5-MeO-DPT (5-methoxy-N,N-dipropyltryptamine)
5-MeO-MiPT
Penis Envy (Psilocybe cubensis, Penis Envy strain)
2C-B-AN
2C-B-FLY
2C-BZ
2C-C
2C-D
2C-E
2C-EF
2C-F (2,5-dimethoxy-4-fluorophenethylamine)
2C-G
2C-I
2C-iP
2C-N
2C-P
2C-T-2
2C-T-21
2C-T-4
2C-T-7
2C-TFM
AEM (�-Ethylmescaline, 2-Amino-1-(3,4,5-trimethoxyphenyl)butane)
Methallylescaline (MAL)
2C-B-FLY-NBOMe
25B-NBOH
25C-NB3OMe
25CN-NBOH
25E-NBOH
25H-NBOMe
25I-NBF
25I-NBMD
25I-NBOH
25I-NBOMe
25iP-NBOMe
25T-2-NBOMe
25T-NBOMe
2C-P-NBOMe (25P-NBOMe, NBOMe-2C-P)
2C-T-4-NBOMe
2C-T-7-NBOMe
C30-NBOMe
BOH-2C-B (BOHB)
Yopo (Anadenanthera peregrina)
`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../");
const dataPath = path.resolve(root, "src/data/articles.json");

const normalizeKey = (value) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();

const readArticles = () => {
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Unable to locate articles data at ${dataPath}`);
  }

  const raw = fs.readFileSync(dataPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse articles JSON: ${error instanceof Error ? error.message : error}`);
  }
};

const writeArticles = (articles) => {
  const serialized = JSON.stringify(articles, null, 2);
  fs.writeFileSync(dataPath, `${serialized}\n`, "utf8");
};

const articles = readArticles();

const aliasList = Array.from(
  new Set(
    RAW_ALIASES.split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  ),
);

const aliasMap = new Map();
for (const alias of aliasList) {
  aliasMap.set(normalizeKey(alias), alias);
}

const keyToIndices = new Map();
const articlesMeta = articles.map((article, index) => {
  const info = article?.drug_info ?? {};
  const primaryName = (info.drug_name ?? article.title ?? "").trim();
  const primaryLower = primaryName.toLowerCase();

  const pushKey = (value) => {
    if (!value) {
      return;
    }
    const key = normalizeKey(value);
    if (!key) {
      return;
    }
    const existing = keyToIndices.get(key);
    if (existing) {
      existing.push(index);
    } else {
      keyToIndices.set(key, [index]);
    }
  };

  pushKey(primaryName);
  if (primaryName.includes("(")) {
    pushKey(primaryName.replace(/\s*\(.*/, ""));
  }

  if (article.title) {
    pushKey(article.title);
    if (article.title.includes("(")) {
      pushKey(article.title.replace(/\s*\(.*/, ""));
    }
  }

  return {
    index,
    primaryName,
    primaryLower,
  };
});

const dedupe = (values) => Array.from(new Set(values));

const matchedIndexSet = new Set();
const aliasSummaries = [];
const unmatchedAliases = [];

for (const [aliasKey, aliasLabel] of aliasMap.entries()) {
  let matches = keyToIndices.get(aliasKey) ?? [];

  if (matches.length === 0) {
    const aliasTrimmed = aliasLabel.replace(/\s*\(.*/, "");
    const baseKey = normalizeKey(aliasTrimmed);
    if (baseKey && baseKey !== aliasKey) {
      matches = keyToIndices.get(baseKey) ?? [];
    }
  }

  if (matches.length === 0) {
    const looseMatches = articlesMeta
      .filter((meta) => meta.primaryLower.includes(aliasLabel.toLowerCase()))
      .map((meta) => meta.index);
    matches = looseMatches;
  }

  matches = dedupe(matches);

  if (matches.length === 0) {
    unmatchedAliases.push(aliasLabel);
    continue;
  }

  aliasSummaries.push({
    alias: aliasLabel,
    matches: matches.map((idx) => articlesMeta[idx].primaryName),
  });

  for (const idx of matches) {
    matchedIndexSet.add(idx);
  }
}

const targetIndices = Array.from(matchedIndexSet).sort((a, b) => a - b);

const updatedNames = [];
let updatedCount = 0;

for (const index of targetIndices) {
  const article = articles[index];
  const info = article?.drug_info;
  if (!info) {
    continue;
  }

  let changed = false;

  if (info.psychoactive_class !== TARGET_PSYCHOACTIVE_CLASS) {
    info.psychoactive_class = TARGET_PSYCHOACTIVE_CLASS;
    changed = true;
  }

  if (info.mechanism_of_action !== TARGET_MECHANISM) {
    info.mechanism_of_action = TARGET_MECHANISM;
    changed = true;
  }

  if (changed) {
    updatedCount += 1;
    updatedNames.push(article.drug_info?.drug_name ?? article.title ?? `index:${index}`);
  }
}

if (updatedCount > 0) {
  writeArticles(articles);
}

const report = {
  totalAliases: aliasList.length,
  matchedAliases: aliasSummaries.length,
  unmatchedAliases,
  updatedEntries: updatedCount,
  updatedNames,
};

console.log(JSON.stringify(report, null, 2));

if (unmatchedAliases.length > 0) {
  console.warn("Unmatched aliases:", unmatchedAliases);
}
