#!/usr/bin/env node
/**
 * Regenerates traditional-charset.json, the script gate's character set.
 *
 * A hand-written list of "Traditional characters" is wrong in both directions:
 * it misses forms and it flags shared characters such as 鼠, which is identical
 * in both scripts. OpenCC's TSCharacters table is the authority, so the gate is
 * derived from it: every Traditional character whose Simplified mapping is a
 * different character.
 *
 * Usage:
 *   node scripts/translation/build-traditional-charset.mjs
 */

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
  // A character that maps to itself is shared by both scripts, not a leak.
  if (mappings.every((candidate) => candidate !== traditional)) characters.push(traditional);
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
