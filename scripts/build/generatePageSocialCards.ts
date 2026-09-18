#!/usr/bin/env bun

// Regenerate one card with `bun scripts/build/generatePageSocialCards.ts --only=replications`.
// Replication stats use the public gallery's hourly-cached corpus and counting rules.
// Generation is local only; R2 publication remains a separate explicit step.

import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import {
  PAGE_SOCIAL_CARD_RENDER_VERSION,
  renderPageSocialCardPng,
} from "../../lib/og/pageSocialCard";
import { PAGE_SOCIAL_CARD_KEYS } from "../../src/data/mappings/pageSocialCardUrl";
import { countGallery } from "../../src/features/effects/gallery/galleryModel";
import {
  isDisplayable,
  isWithheldFromArtistViews,
} from "../../src/features/effects/gallery/galleryArtistIdentity";
import type { GalleryCounts } from "../../src/features/effects/gallery/galleryTypes";
import type { PublicGalleryReplicationPreview } from "../../src/types/replications";

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
  "src/assets/replications-after-images-chelsea-morgan.webp",
  "public/profile-avatars/josie/avatar.webp",
  "public/images/downloads/dosewiki-freeodwiki-banner.webp",
  "public/fonts/NotoSansCJKsc-Bold.china-card-subset.otf",
  "public/downloads/zh-Hans/manifest.json",
  "public/dosewiki-molecules.json",
  "public/fonts/Blinker-Regular.ttf",
  "public/fonts/Blinker-SemiBold.ttf",
  "public/flags/cn.svg",
  "public/flags/nl.svg",
  "public/flags/pl.svg",
  "public/flags/cz.svg",
  "public/flags/fr.svg",
  "public/flags/de.svg",
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

async function rendererDigest(key: string, counts?: GalleryCounts): Promise<string> {
  const hash = createHash("sha256")
    .update(PAGE_SOCIAL_CARD_RENDER_VERSION)
    .update("\0")
    .update(key);
  if (counts) hash.update("\0").update(JSON.stringify(counts));
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

  const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice(7);
  if (only && !PAGE_SOCIAL_CARD_KEYS.some((key) => key === only)) {
    throw new Error(`Unknown page social card: ${only}`);
  }
  const keys = PAGE_SOCIAL_CARD_KEYS.filter((key) => !only || key === only);
  const cards: Record<string, string> = only
    ? (JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as CardManifest).cards
    : {};
  let replicationCounts: GalleryCounts | undefined;
  if (keys.includes("replications")) {
    const response = await fetch("https://dose.wiki/api/replications/gallery");
    if (!response.ok) throw new Error(`Gallery read failed: HTTP ${response.status}`);
    const { data } = await response.json() as { data: PublicGalleryReplicationPreview[] };
    replicationCounts = countGallery(data.filter(
      (item) => isDisplayable(item) && !isWithheldFromArtistViews(item),
    ));
    console.log("[page-social-cards] Live gallery counts:", replicationCounts);
  }
  const expectedFiles = new Set<string>();
  let rendered = 0;
  let reused = 0;

  for (const key of keys) {
    const counts = key === "replications" ? replicationCounts : undefined;
    const digest = await rendererDigest(key, counts);
    const filename = `${key}.${digest}.jpg`;
    const outputPath = path.join(OUTPUT_DIR, filename);
    cards[key] = `${MANIFEST_PUBLIC_PREFIX}/${filename}`;
    expectedFiles.add(filename);

    if (await pathExists(outputPath)) {
      reused += 1;
      continue;
    }

    const png = await renderPageSocialCardPng(key, counts);
    const jpeg = await sharp(png)
      .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
      .toBuffer();
    await writeAtomic(outputPath, jpeg);
    rendered += 1;
  }

  const currentFiles = await readdir(OUTPUT_DIR);
  const staleFiles = currentFiles.filter(
    (filename) =>
      (!only || filename.startsWith(`${only}.`)) &&
      /\.(?:jpe?g|png|webp)$/i.test(filename) && !expectedFiles.has(filename),
  );
  await Promise.all(staleFiles.map((filename) => rm(path.join(OUTPUT_DIR, filename))));

  const manifest: CardManifest = {
    version: 1,
    rendererVersion: PAGE_SOCIAL_CARD_RENDER_VERSION,
    cards,
  };
  await writeAtomic(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    `[page-social-cards] Complete: ${keys.length} cards (${rendered} rendered, ${reused} reused, ${staleFiles.length} stale removed).`,
  );
}

await main();
