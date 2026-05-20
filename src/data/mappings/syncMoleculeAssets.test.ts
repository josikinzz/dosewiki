import { promises as fs } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { MOLECULE_ASSET_MANIFEST_RELATIVE_PATH } from "./moleculeAssets";

describe("syncMoleculeAssets manifest path", () => {
  it("reads the same manifest path used by the runtime catalog", async () => {
    const scriptPath = path.resolve(process.cwd(), "scripts/data/syncMoleculeAssets.mjs");
    const source = await fs.readFile(scriptPath, "utf8");

    expect(source).toContain("moleculeAssetManifest.json");
    expect(MOLECULE_ASSET_MANIFEST_RELATIVE_PATH).toBe("src/data/mappings/moleculeSvgMappings.json");
  });
});
