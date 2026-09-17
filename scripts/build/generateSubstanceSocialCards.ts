#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { access, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import path from "node:path";

import { createDataClient } from "../lib/data-client.ts";
import sharp from "sharp";

import { api } from "../../lib/postgres/runtime/api.ts";
import { getFlagValue } from "../lib/data-ops-run-context.mjs";
import {
  renderMoleculeSocialCardPng,
  SUBSTANCE_SOCIAL_CARD_RENDER_VERSION,
} from "../../lib/og/moleculeSocialCard";
import { recolorMoleculeSvgToEffectIndex } from "../../src/data/mappings/moleculePalette";
import { getAllSubstanceDocuments } from "../lib/data-pagination.mjs";

const OUTPUT_DIR = path.join(process.cwd(), "public/images/social/substances");
const MANIFEST_PATH = path.join(
  process.cwd(),
  "src/data/substanceSocialCardManifest.generated.json",
);
const MANIFEST_PUBLIC_PREFIX = "/images/social/substances";
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

type CardSourceArticle = {
  slug: string;
  title: string;
  classification?: {
    psychoactive_class?: unknown;
    chemical_class?: unknown;
  };
};

type MoleculeRevision = {
  slug: string;
  updatedAt: string;
};

type CardManifest = {
  version: 1;
  rendererVersion: string;
  cards: Record<string, string>;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function sourceDigest(input: {
  slug: string;
  title: string;
  moleculeUpdatedAt: string | null;
  psychoactiveClasses: readonly string[];
  chemicalClasses: readonly string[];
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        rendererVersion: SUBSTANCE_SOCIAL_CARD_RENDER_VERSION,
        ...input,
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

async function writeAtomic(targetPath: string, content: string | Buffer): Promise<void> {
  const temporaryPath = `${targetPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content);
  await rename(temporaryPath, targetPath);
}

async function main(): Promise<void> {
  if (process.env.NEXT_PUBLIC_SITE_FLAVOR?.trim().toLowerCase() === "effectindex") {
    console.log("[social-cards] Effect Index build: dose.wiki substance cards are not referenced; skipping generation.");
    return;
  }

  const { client, fingerprint: deploymentName } = createDataClient();
  const expected = getFlagValue(process.argv.slice(2), "--expected-deployment");
  if (!expected || expected !== deploymentName) {
    throw new Error(`Social cards require --expected-deployment=${deploymentName} for the selected Postgres source.`);
  }
  console.log(`[social-cards] Reading substances and molecule revisions from ${deploymentName}...`);
  const [rawArticles, moleculeRevisions] = await Promise.all([
    getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage),
    client.query(api.moleculeOverrides.listSlugs, {}),
  ]);
  const articles = (rawArticles as CardSourceArticle[])
    .filter((article) => {
      if (!SLUG_RE.test(article.slug) || typeof article.title !== "string") {
        throw new Error(`Invalid substance social-card source: ${JSON.stringify(article)}`);
      }
      return true;
    })
    .sort((left, right) => left.slug.localeCompare(right.slug));
  const moleculeRevisionBySlug = new Map(
    (moleculeRevisions as MoleculeRevision[])
      .filter((row) => !row.slug.startsWith("class:"))
      .map((row) => [row.slug, row.updatedAt] as const),
  );

  await mkdir(OUTPUT_DIR, { recursive: true });

  const cards = new Map<string, string>();
  const expectedFiles = new Set<string>();
  const failures: string[] = [];
  let rendered = 0;
  let reused = 0;
  let nextIndex = 0;

  const concurrency = Math.max(1, Math.min(6, availableParallelism()));
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const articleIndex = nextIndex;
      nextIndex += 1;
      const article = articles[articleIndex];
      if (!article) {
        return;
      }

      const psychoactiveClasses = stringArray(article.classification?.psychoactive_class);
      const chemicalClasses = stringArray(article.classification?.chemical_class);
      const moleculeUpdatedAt = moleculeRevisionBySlug.get(article.slug) ?? null;
      const digest = sourceDigest({
        slug: article.slug,
        title: article.title,
        moleculeUpdatedAt,
        psychoactiveClasses,
        chemicalClasses,
      });
      const filename = `${article.slug}.${digest}.jpg`;
      const outputPath = path.join(OUTPUT_DIR, filename);
      cards.set(article.slug, `${MANIFEST_PUBLIC_PREFIX}/${filename}`);
      expectedFiles.add(filename);

      try {
        if (await pathExists(outputPath)) {
          reused += 1;
          continue;
        }

        const moleculeRow = moleculeUpdatedAt
          ? await client.query(api.moleculeOverrides.getBySlug, { slug: article.slug })
          : null;
        if (moleculeUpdatedAt && !moleculeRow) {
          throw new Error("Molecule disappeared after its revision was listed.");
        }

        const moleculeSvg = moleculeRow
          ? recolorMoleculeSvgToEffectIndex(moleculeRow.svg, "dark")
          : null;
        const png = await renderMoleculeSocialCardPng({
          title: article.title,
          moleculeSvg,
          psychoactiveClasses,
          chemicalClasses,
        });
        const jpeg = await sharp(png)
          .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
          .toBuffer();
        await writeAtomic(outputPath, jpeg);
        rendered += 1;
        if ((rendered + reused) % 25 === 0) {
          console.log(
            `[social-cards] ${rendered + reused}/${articles.length} complete (${rendered} rendered, ${reused} reused)`,
          );
        }
      } catch (error) {
        failures.push(
          `${article.slug}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  });

  await Promise.all(workers);
  if (failures.length > 0) {
    throw new Error(`Failed to generate ${failures.length} social card(s):\n${failures.join("\n")}`);
  }

  const currentFiles = await readdir(OUTPUT_DIR);
  const staleFiles = currentFiles.filter(
    (filename) =>
      /\.(?:jpe?g|png|webp)$/i.test(filename) && !expectedFiles.has(filename),
  );
  await Promise.all(staleFiles.map((filename) => rm(path.join(OUTPUT_DIR, filename))));

  const sortedCards = Object.fromEntries(
    [...cards.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
  const manifest: CardManifest = {
    version: 1,
    rendererVersion: SUBSTANCE_SOCIAL_CARD_RENDER_VERSION,
    cards: sortedCards,
  };
  await writeAtomic(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  const withoutMolecules = articles.filter(
    (article) => !moleculeRevisionBySlug.has(article.slug),
  );
  console.log(
    `[social-cards] Complete: ${articles.length} cards (${rendered} rendered, ${reused} reused, ${staleFiles.length} stale removed).`,
  );
  if (withoutMolecules.length > 0) {
    console.log(
      `[social-cards] ${withoutMolecules.length} card(s) intentionally rendered without molecule artwork: ${withoutMolecules.map((article) => article.slug).join(", ")}`,
    );
  }
}

await main();
