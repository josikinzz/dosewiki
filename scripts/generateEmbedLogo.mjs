import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SOURCE_SVG = resolve(ROOT, "src/assets/dosewiki-logo.svg");
const OUTPUT_IMAGE = resolve(ROOT, "public/embed-logo.webp");

async function main() {
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
  const webpBuffer = await sharp(pngBuffer).webp({ quality: 95 }).toBuffer();
  await writeFile(OUTPUT_IMAGE, webpBuffer);
  console.log(`Generated embed logo at ${OUTPUT_IMAGE}`);
}

main().catch((error) => {
  console.error("Failed to generate embed logo:", error);
  process.exit(1);
});
