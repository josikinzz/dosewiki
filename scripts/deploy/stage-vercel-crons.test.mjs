import assert from "node:assert/strict";
import test from "node:test";

import { stageCronsForArtifact } from "./stage-vercel-crons.mjs";

const ROOT_CONFIG = {
  buildCommand: "bun run build:vercel",
  crons: [
    { path: "/open-data/SubstanceIndex.json", schedule: "0 9 * * *" },
    { path: "/api/warm", schedule: "0 * * * *" },
    { path: "/api/cron/publication-delivery", schedule: "* * * * *" },
    { path: "/api/cron/translation-bulk", schedule: "* * * * *" },
  ],
};

test("public and effectindex keep only the reader jobs", () => {
  for (const artifact of ["public", "effectindex"]) {
    const staged = stageCronsForArtifact(ROOT_CONFIG, artifact);
    assert.deepEqual(
      staged.crons.map((cron) => cron.path),
      ["/open-data/SubstanceIndex.json", "/api/warm"],
    );
  }
});

test("editor keeps only the writer jobs", () => {
  const staged = stageCronsForArtifact(ROOT_CONFIG, "editor");
  assert.deepEqual(
    staged.crons.map((cron) => cron.path),
    ["/api/cron/publication-delivery", "/api/cron/translation-bulk"],
  );
});

test("the rest of the config is preserved and the input is not mutated", () => {
  const staged = stageCronsForArtifact(ROOT_CONFIG, "public");
  assert.equal(staged.buildCommand, ROOT_CONFIG.buildCommand);
  assert.equal(ROOT_CONFIG.crons.length, 4);
});

test("an unknown artifact throws", () => {
  assert.throws(() => stageCronsForArtifact(ROOT_CONFIG, "staging"), /Unknown artifact/);
});
