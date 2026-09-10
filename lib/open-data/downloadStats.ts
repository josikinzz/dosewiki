import "server-only";

import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { cache } from "react";
import { buildOpenDataDocument, OPEN_DATA_DATASETS, type OpenDataDatasetName } from "./datasets";

/** What a download button states about its file: records inside, bytes on disk. */
export type PublicDownloadStats = {
  count: number;
  bytes: number;
};

/**
 * Entry count and decoded size of one `/open-data` JSON download, measured on
 * the document the route serves rather than estimated from the page's own
 * counts (the About page's substance total includes unlisted articles the
 * export leaves out).
 *
 * This composition reuses the public readers' persistent leaves. An outer
 * persistent cache would bypass those leaves on misses and rescan Convex.
 * The containing page's ISR caches the rendered labels with the document.
 */
export const getOpenDataDownloadStats = cache(
  async (dataset: OpenDataDatasetName): Promise<PublicDownloadStats> => {
    const { count, json } = await buildOpenDataDocument(OPEN_DATA_DATASETS[dataset]);
    return { count, bytes: Buffer.byteLength(json) };
  },
);

let moleculePackDownloadStats: PublicDownloadStats | null = null;

/**
 * Entry count and size of the committed molecule pack. Both come from the
 * files the reader downloads (`public/dosewiki-molecules.{json,zip}`, rebuilt
 * and committed nightly by `npm run molecules:pack`), so the label describes
 * the zip on this deployment even when Convex has gained a depiction since.
 * The manifest's `count` already excludes class skeletons and unlisted
 * substances. Read once per process: the files never change between deploys.
 */
export function getMoleculePackDownloadStats(): PublicDownloadStats {
  if (moleculePackDownloadStats === null) {
    const manifest: unknown = JSON.parse(
      readFileSync(path.join(process.cwd(), "public/dosewiki-molecules.json"), "utf8"),
    );
    const count =
      manifest && typeof manifest === "object" && "count" in manifest ? manifest.count : undefined;
    if (typeof count !== "number") {
      throw new Error("public/dosewiki-molecules.json has no numeric count; rerun npm run molecules:pack");
    }
    moleculePackDownloadStats = {
      count,
      bytes: statSync(path.join(process.cwd(), "public/dosewiki-molecules.zip")).size,
    };
  }
  return moleculePackDownloadStats;
}

let moleculePackSlugs: string[] | null = null;

/** Every substance slug the molecule pack draws, in manifest order. */
export function getMoleculePackSlugs(): string[] {
  if (moleculePackSlugs === null) {
    const manifest: unknown = JSON.parse(
      readFileSync(path.join(process.cwd(), "public/dosewiki-molecules.json"), "utf8"),
    );
    const rows =
      manifest && typeof manifest === "object" && "molecules" in manifest && Array.isArray(manifest.molecules)
        ? manifest.molecules
        : [];
    moleculePackSlugs = rows
      .map((row: unknown) => (row && typeof row === "object" && "slug" in row ? row.slug : null))
      .filter((slug: unknown): slug is string => typeof slug === "string" && slug.length > 0);
  }
  return moleculePackSlugs;
}

