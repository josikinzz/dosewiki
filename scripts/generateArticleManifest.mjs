// scripts/generateArticleManifest.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTICLES_DIR = path.join(__dirname, "..", "drug-info-articles");
const OUTPUT_PATH = path.join(__dirname, "..", "src", "data", "articleSourceManifest.json");

const SOURCE_DISPLAY_NAMES = {
  PSYCHONAUTWIKI: "PsychonautWiki",
  TRIPSIT_FACTSHEETS: "TripSit Factsheets",
  TRIPSIT_WIKI: "TripSit Wiki",
  WIKIPEDIA: "Wikipedia",
  EROWID: "Erowid",
  ISOMERDESIGN: "Isomer Design",
  DRUGBANK: "DrugBank",
  DISREGARDEVERYTHINGISAY: "DEIA",
  PROTESTKIT: "Protest Kit",
  BLUELIGHT: "Bluelight",
  DMTURNER: "D.M. Turner",
  DRUGUSERSBIBLE: "Drug Users Bible",
  SAFERPARTY: "Safer Party",
  THEDRUGCLASSROOM: "The Drug Classroom",
};

function getDisplayName(sourceKey) {
  return SOURCE_DISPLAY_NAMES[sourceKey] || sourceKey;
}

async function generateManifest() {
  const substances = [];

  const entries = fs.readdirSync(ARTICLES_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "." || entry.name === "..") continue;

    const substanceDir = path.join(ARTICLES_DIR, entry.name);
    const files = fs.readdirSync(substanceDir);

    const sources = [];
    for (const file of files) {
      if (!file.endsWith(".md") && !file.endsWith(".json")) continue;

      const sourceKey = file.split(" - ")[0];
      const displayName = getDisplayName(sourceKey);
      const filePath = path.join(substanceDir, file);
      const stats = fs.statSync(filePath);

      sources.push({
        id: sourceKey.toLowerCase().replace(/_/g, "-"),
        fileName: file,
        displayName,
        size: stats.size,
      });
    }

    if (sources.length > 0) {
      substances.push({
        name: entry.name,
        sources: sources.sort((a, b) => a.displayName.localeCompare(b.displayName)),
      });
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    substances: substances.sort((a, b) => a.name.localeCompare(b.name)),
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(manifest, null, 2));
  console.log(`Generated manifest with ${substances.length} substances`);
}

generateManifest().catch(console.error);
