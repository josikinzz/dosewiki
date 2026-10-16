import "server-only";

import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { PublicDownloadStats } from "../../src/lib/openDataDownloadStats";

let moleculePackDownloadStats: PublicDownloadStats | null = null;

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

