#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  PAGE_SOCIAL_CARD_RENDER_VERSION,
  renderPageSocialCardPng,
} from "../../lib/og/pageSocialCard";
import { PAGE_SOCIAL_CARD_KEYS } from "../../src/data/mappings/pageSocialCardUrl";

const OUTPUT_DIR = path.join(process.cwd(), "public/images/social/pages");
const MANIFEST_PATH = path.join(
  process.cwd(),
  "src/data/pageSocialCardManifest.generated.json",
);
const MANIFEST_PUBLIC_PREFIX = "/images/social/pages";

const RENDER_INPUT_PATHS = [
  "lib/og/pageSocialCard.ts",
  "lib/og/socialCardPrimitives.ts",
  "src/assets/dosewiki-logo.svg",
  "public/profile-avatars/josie/avatar.webp",
  "public/fonts/Blinker-Regular.ttf",
  "public/fonts/Blinker-SemiBold.ttf",
] as const;

type CardManifest = {
  version: 1;
  rendererVersion: string;
  cards: Record<string, string>;
};

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function writeAtomic(targetPath: string, content: string | Buffer): Promise<void> {
  const temporaryPath = `${targetPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content);
  await rename(temporaryPath, targetPath);
}

async function rendererDigest(key: string): Promise<string> {
  const hash = createHash("sha256")
    .update(PAGE_SOCIAL_CARD_RENDER_VERSION)
    .update("\0")
    .update(key);
  for (const inputPath of RENDER_INPUT_PATHS) {
    hash.update("\0").update(inputPath).update("\0");
    hash.update(await readFile(path.join(process.cwd(), inputPath)));
  }
  return hash.digest("hex").slice(0, 16);
}

async function main(): Promise<void> {
  if (process.env.NEXT_PUBLIC_SITE_FLAVOR?.trim().toLowerCase() === "effectindex") {
    console.log(
      "[page-social-cards] Effect Index build: dose.wiki page cards are not referenced; skipping generation.",
    );
    return;
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const cards: Record<string, string> = {};
  const expectedFiles = new Set<string>();
  let rendered = 0;
  let reused = 0;

  for (const key of PAGE_SOCIAL_CARD_KEYS) {
    const digest = await rendererDigest(key);
    const filename = `${key}.${digest}.png`;
    const outputPath = path.join(OUTPUT_DIR, filename);
    cards[key] = `${MANIFEST_PUBLIC_PREFIX}/${filename}`;
    expectedFiles.add(filename);

    if (await pathExists(outputPath)) {
      reused += 1;
      continue;
    }

    await writeAtomic(outputPath, await renderPageSocialCardPng(key));
    rendered += 1;
  }

  const currentFiles = await readdir(OUTPUT_DIR);
  const staleFiles = currentFiles.filter(
    (filename) => filename.endsWith(".png") && !expectedFiles.has(filename),
  );
  await Promise.all(staleFiles.map((filename) => rm(path.join(OUTPUT_DIR, filename))));

  const manifest: CardManifest = {
    version: 1,
    rendererVersion: PAGE_SOCIAL_CARD_RENDER_VERSION,
    cards,
  };
  await writeAtomic(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    `[page-social-cards] Complete: ${PAGE_SOCIAL_CARD_KEYS.length} cards (${rendered} rendered, ${reused} reused, ${staleFiles.length} stale removed).`,
  );
}

await main();
