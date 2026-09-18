import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { makeLoaderCspCompatible } from "../tools/copyRdkitAssets.mjs";

const loaderPath = new URL(
  "../../node_modules/@rdkit/rdkit/dist/RDKit_minimal.js",
  import.meta.url,
);

test("RDKit asset transform removes JavaScript dynamic execution", async () => {
  const upstream = await readFile(loaderPath, "utf8");
  const transformed = makeLoaderCspCompatible(upstream);

  assert.doesNotMatch(transformed, /\b(?:eval|Function)\s*\(/u);
  assert.match(transformed, /WebAssembly/u);
  assert.match(transformed, /Reflect\.construct/u);
});

test("RDKit asset transform fails closed when upstream code changes", () => {
  assert.throws(
    () => makeLoaderCspCompatible("var initRDKitModule = function () {}"),
    /review the CSP transform/u,
  );
});
