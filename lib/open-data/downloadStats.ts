import "server-only";

import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { PUBLIC_CONVEX_CACHE_TAGS } from "../convex/publicData.cache";
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
 * Building the document drains the full corpus from Convex, so the result is
 * held in the data cache on the routes' own daily cadence. Deliberately tagged
 * with the bulk-import tag only: editor saves expire the per-dataset tags many
 * times a day, and each expiry here would cost another corpus drain for a
 * label that changes by a few kilobytes.
 */
export const getOpenDataDownloadStats = cache(
  unstable_cache(
    async (dataset: OpenDataDatasetName): Promise<PublicDownloadStats> => {
      const { count, json } = await buildOpenDataDocument(OPEN_DATA_DATASETS[dataset]);
      return { count, bytes: Buffer.byteLength(json) };
    },
    ["open-data-download-stats"],
    { revalidate: 86400, tags: [PUBLIC_CONVEX_CACHE_TAGS.all] },
  ),
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
