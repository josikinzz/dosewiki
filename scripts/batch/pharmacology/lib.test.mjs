import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNonRegressivePharmacologyReplacement,
  parseArgs,
} from "./lib.mjs";

test("pharmacology CLI accepts the shared production write ceremony flags", () => {
  const options = parseArgs(
    [
      "--write",
      "--confirm-write=batch-pharmacology-generation",
      "--expected-deployment=localhost/example-deployment",
    ],
    { maxConcurrency: 3 },
  );

  assert.equal(options.write, true);
  assert.equal(options.confirmWrite, "batch-pharmacology-generation");
  assert.equal(options.expectedDeployment, "localhost/example-deployment");
});

test("pharmacology replacement rejects empty and field-regressing output", () => {
  const article = {
    pharmacology: {
      pharmacodynamics: "Existing overview",
      binding_sites: [{ target: "5-HT2A", tag: "agonist" }],
    },
  };

  assert.throws(
    () => assertNonRegressivePharmacologyReplacement(article, {}),
    /Generated pharmacology is empty/,
  );
  assert.throws(
    () => assertNonRegressivePharmacologyReplacement(article, {
      pharmacodynamics: "Generated overview",
    }),
    /regresses populated fields \(2 -> 1\)/,
  );
  assert.deepEqual(
    assertNonRegressivePharmacologyReplacement(article, {
      pharmacodynamics: "Generated overview",
      binding_sites: [{ target: "5-HT2A", tag: "partial agonist" }],
    }),
    { existingFieldCount: 2, generatedFieldCount: 2 },
  );
});
