import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SOURCE_SVG = resolve(ROOT, "src/assets/dosewiki-logo.svg");
const OUTPUT_WEBP = resolve(ROOT, "public/embed-logo.webp");
const OUTPUT_PNG = resolve(ROOT, "public/dosewiki-logo.png");

const getFileMeta = async (path) => {
  try {
    return await stat(path);
  } catch {
    return null;
  }
};

async function main() {
  const force = process.argv.includes("--force") || process.env.FORCE_SHARE_LOGO === "true";
  const [sourceMeta, pngMeta, webpMeta] = await Promise.all([
    getFileMeta(SOURCE_SVG),
    getFileMeta(OUTPUT_PNG),
    getFileMeta(OUTPUT_WEBP),
  ]);

  if (!sourceMeta) {
    throw new Error(`Missing logo source at ${SOURCE_SVG}`);
  }

  const needsRegeneration =
    force ||
    !pngMeta ||
    !webpMeta ||
    pngMeta.mtimeMs < sourceMeta.mtimeMs ||
    webpMeta.mtimeMs < sourceMeta.mtimeMs;

  if (!needsRegeneration) {
    console.log("Share assets already up to date – skipping regeneration.");
    return;
  }

  const svg = await readFile(SOURCE_SVG, "utf8");
  const resvg = new Resvg(svg, {
    background: "rgba(0,0,0,0)",
    fitTo: {
      mode: "width",
      value: 1200,
    },
  });
  const image = resvg.render();
  const pngBuffer = image.asPng();
  await writeFile(OUTPUT_PNG, pngBuffer);
  const webpBuffer = await sharp(pngBuffer).webp({ quality: 95 }).toBuffer();
  await writeFile(OUTPUT_WEBP, webpBuffer);
  console.log(`Generated share assets at ${OUTPUT_PNG} and ${OUTPUT_WEBP}`);
}

main().catch((error) => {
  console.error("Failed to generate embed logo:", error);
  process.exit(1);
});
