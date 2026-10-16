import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requireApplyConfirmation } from "./publishSocialCardsToR2.mjs";

describe("social-card R2 publication plan", () => {
  it("requires explicit apply plus exact target and bucket confirmations", () => {
    const valid = [
      "--apply",
      "--confirm-operation=publish-social-cards",
      "--confirm-plan=abc",
      "--confirm-target=replications-r2:",
      "--confirm-bucket=replications",
    ];
    assert.doesNotThrow(() => requireApplyConfirmation(valid, "replications-r2:", "replications", "abc"));
    assert.throws(() => requireApplyConfirmation(valid.filter((arg) => arg !== "--apply"), "replications-r2:", "replications", "abc"), /--apply/);
    assert.throws(() => requireApplyConfirmation(valid.with(2, "--confirm-plan=wrong"), "replications-r2:", "replications", "abc"), /confirm-plan/);
    assert.throws(() => requireApplyConfirmation(valid.with(3, "--confirm-target=other:"), "replications-r2:", "replications", "abc"), /confirm-target/);
    assert.throws(() => requireApplyConfirmation(valid.with(4, "--confirm-bucket=other"), "replications-r2:", "replications", "abc"), /confirm-bucket/);
  });
});
