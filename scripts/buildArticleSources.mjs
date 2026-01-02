// scripts/buildArticleSources.mjs
// Builds drug-info-articles into lazy-loadable TypeScript modules
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTICLES_DIR = path.join(__dirname, "..", "drug-info-articles");
const OUTPUT_DIR = path.join(__dirname, "..", "src", "data", "article-sources");

const SOURCE_DISPLAY_NAMES = {
  PSYCHONAUTWIKI: "PsychonautWiki",
  TRIPSIT_FACTSHEETS: "TripSit Factsheets",
  TRIPSIT_WIKI: "TripSit Wiki",
  WIKIPEDIA: "Wikipedia",
  EROWID: "Erowid",
  ISOMERDESIGN: "Isomer Design",
  DRUGBANK: "DrugBank",
  DISREGARDEVERYTHINGISAY: "Disregard Everything I Say",
  PROTESTKIT: "Protest Kit",
  DMTURNER: "D.M. Turner",
  DRUGUSERSBIBLE: "Drug Users Bible",
  SAFERPARTY: "Safer Party",
  THEDRUGCLASSROOM: "The Drug Classroom",
};

// Sources to exclude from the generator
const EXCLUDED_SOURCES = new Set(["BLUELIGHT", "DMTURNER"]);

function getDisplayName(sourceKey) {
  return SOURCE_DISPLAY_NAMES[sourceKey] || sourceKey;
}

function escapeString(str) {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function buildArticleSources() {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const entries = fs.readdirSync(ARTICLES_DIR, { withFileTypes: true });
  const substanceIndex = [];
  const seenSlugs = new Set();
  let totalFiles = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "." || entry.name === "..") continue;

    const substanceName = entry.name;
    const substanceSlug = slugify(substanceName);
    const substanceDir = path.join(ARTICLES_DIR, substanceName);
    const files = fs.readdirSync(substanceDir);

    const sources = [];
    const seenSourceIds = new Set();
    for (const file of files) {
      if (!file.endsWith(".md") && !file.endsWith(".json")) continue;

      const sourceKey = file.split(" - ")[0];

      // Skip excluded sources
      if (EXCLUDED_SOURCES.has(sourceKey)) continue;

      const sourceId = sourceKey.toLowerCase().replace(/_/g, "-");

      // Skip duplicate source IDs within the same substance
      if (seenSourceIds.has(sourceId)) continue;
      seenSourceIds.add(sourceId);

      const displayName = getDisplayName(sourceKey);
      const filePath = path.join(substanceDir, file);
      const content = fs.readFileSync(filePath, "utf-8");

      sources.push({
        id: sourceId,
        fileName: file,
        displayName,
        size: content.length,
        content,
      });
      totalFiles++;
    }

    if (sources.length === 0) continue;

    // Skip if we've already seen this slug (handle case-insensitive duplicates)
    if (seenSlugs.has(substanceSlug)) {
      console.warn(`Skipping duplicate slug: ${substanceSlug} (${substanceName})`);
      continue;
    }
    seenSlugs.add(substanceSlug);

    // Generate TypeScript module for this substance
    const moduleContent = `// Auto-generated - do not edit
export const substanceName = ${JSON.stringify(substanceName)};
export const sources = ${JSON.stringify(sources.map(s => ({
      id: s.id,
      fileName: s.fileName,
      displayName: s.displayName,
      size: s.size,
    })))};
export const contents: Record<string, string> = {
${sources.map(s => `  ${JSON.stringify(s.id)}: \`${escapeString(s.content)}\`,`).join("\n")}
};
`;

    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${substanceSlug}.ts`),
      moduleContent
    );

    substanceIndex.push({
      name: substanceName,
      slug: substanceSlug,
      sources: sources.map(s => ({
        id: s.id,
        fileName: s.fileName,
        displayName: s.displayName,
        size: s.size,
      })),
    });
  }

  // Generate index file with lazy imports
  const indexContent = `// Auto-generated - do not edit
export interface SourceInfo {
  id: string;
  fileName: string;
  displayName: string;
  size: number;
}

export interface SubstanceInfo {
  name: string;
  slug: string;
  sources: SourceInfo[];
}

export const substances: SubstanceInfo[] = ${JSON.stringify(substanceIndex, null, 2)};

export type SubstanceModule = {
  substanceName: string;
  sources: SourceInfo[];
  contents: Record<string, string>;
};

const moduleLoaders: Record<string, () => Promise<SubstanceModule>> = {
${substanceIndex.map(s => `  ${JSON.stringify(s.slug)}: () => import("./${s.slug}"),`).join("\n")}
};

export async function loadSubstanceSources(slug: string): Promise<SubstanceModule | null> {
  const loader = moduleLoaders[slug];
  if (!loader) return null;
  return loader();
}
`;

  fs.writeFileSync(path.join(OUTPUT_DIR, "index.ts"), indexContent);

  // Copy PROMPT.md to output directory and create import wrapper
  const promptPath = path.join(ARTICLES_DIR, "PROMPT.md");
  const outputPromptMdPath = path.join(OUTPUT_DIR, "prompt.md");
  if (fs.existsSync(promptPath)) {
    // Only copy if output prompt.md doesn't exist (preserve edits made via DevMode)
    if (!fs.existsSync(outputPromptMdPath)) {
      const promptContent = fs.readFileSync(promptPath, "utf-8");
      fs.writeFileSync(outputPromptMdPath, promptContent);
    }
    // Generate prompt.ts that imports from the markdown file
    const promptModule = `// Auto-generated - do not edit
import promptContent from './prompt.md?raw';
export const systemPrompt = promptContent;
`;
    fs.writeFileSync(path.join(OUTPUT_DIR, "prompt.ts"), promptModule);
  }

  console.log(`Built ${substanceIndex.length} substance modules with ${totalFiles} source files`);
}

buildArticleSources().catch(console.error);
