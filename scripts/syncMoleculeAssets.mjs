import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const datasetDir = path.join(repoRoot, "molecule svg dataset");
const outputDir = repoRoot;
const moleculesDir = path.join(outputDir, "public", "molecules");
const mappingPath = path.join(repoRoot, "src", "data", "moleculeSvgMappings.json");

const loadMappings = async () => {
  const raw = await fs.readFile(mappingPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.mappings)) {
    throw new Error("moleculeSvgMappings.json is missing a mappings array");
  }
  return parsed.mappings;
};

const ensureDirectory = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const resetDirectory = async (dir) => {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  await ensureDirectory(dir);
};

const copyAssets = async () => {
  const mappings = await loadMappings();
  await resetDirectory(moleculesDir);

  const missing = [];
  let copied = 0;

  for (const mapping of mappings) {
    if (!mapping || typeof mapping.filename !== "string") {
      continue;
    }

    const trimmedFilename = mapping.filename.trim();
    if (!trimmedFilename) {
      continue;
    }

    const safeName = path.basename(trimmedFilename);
    const containsPathTraversal =
      safeName !== trimmedFilename ||
      safeName.includes("..") ||
      trimmedFilename.includes("/") ||
      trimmedFilename.includes("\\") ||
      trimmedFilename.includes(path.sep);

    if (containsPathTraversal) {
      continue;
    }

    const extension = path.extname(safeName).toLowerCase();
    if (extension !== ".svg") {
      continue;
    }

    const sourcePath = path.resolve(datasetDir, safeName);
    const destinationPath = path.join(outputDir, "public", "molecules", safeName);

    try {
      await fs.copyFile(sourcePath, destinationPath);
      copied += 1;
    } catch (error) {
      if (error.code === "ENOENT") {
        missing.push(safeName);
        continue;
      }
      throw error;
    }
  }

  if (missing.length > 0) {
    console.warn("The following molecule SVGs were not found in the dataset directory:");
    missing.forEach((filename) => console.warn(`  - ${filename}`));
  }

  console.log(`Copied ${copied} molecule SVG${copied === 1 ? "" : "s"} to public/molecules/`);
};

copyAssets().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
