#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL =
  "https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/dictionary/TSCharacters.txt";

const outputPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "traditional-charset.json",
);

const response = await fetch(SOURCE_URL);
if (!response.ok) {
  throw new Error(`OpenCC fetch failed: ${response.status} ${response.statusText}`);
}

const characters = [];
for (const line of (await response.text()).split("\n")) {
  if (line.startsWith("#") || !line.includes("\t")) continue;
  const [traditional, simplified] = line.split("\t");
  if (traditional.length !== 1) continue;
  const mappings = simplified.trim().split(" ").filter(Boolean);
  if (mappings.length === 0) continue;
  if (mappings.some((candidate) => candidate === traditional)) continue;
  if (mappings.every((candidate) => [...candidate].some((point) => point.codePointAt(0) > 0xffff))) continue;
  characters.push(traditional);
}

characters.sort();

await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      source: SOURCE_URL,
      producer: "node scripts/translation/build-traditional-charset.mjs",
      count: characters.length,
      characters: characters.join(""),
    },
    null,
    2,
  )}\n`,
);

console.log(`Wrote ${characters.length} traditional-only characters to ${path.relative(process.cwd(), outputPath)}`);
