import assert from "node:assert/strict";
import test from "node:test";
import { evaluateReleaseEvidence } from "./release-evidence.mjs";

test("a matching compiled digest alone does not verify rendered translations", () => {
  assert.equal(evaluateReleaseEvidence({ expectedDigest: "abc", observedDigest: "abc", status: 200, checks: [] }).verified, false);
  assert.equal(evaluateReleaseEvidence({ expectedDigest: "abc", observedDigest: "abc", status: 200, checks: [{ id: "appearance.light", passed: false }] }).verified, false);
});

test("correct text from an old deployment does not verify the new catalog", () => {
  const checks = [{ id: "appearance.light", passed: true }];
  assert.equal(evaluateReleaseEvidence({ expectedDigest: "new", observedDigest: "old", status: 200, checks }).verified, false);
  assert.equal(evaluateReleaseEvidence({ expectedDigest: "new", observedDigest: "new", status: 200, checks }).verified, true);
});
