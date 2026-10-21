import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authorizeStorageWrite } from "./storage-write-authorization.mjs";

const expected = { operation: "fixture-upload", plan: "abc", target: "fixture-r2:bucket", bucket: "bucket" };
const valid = [
  "--write",
  "--confirm-write=fixture-upload",
  "--confirm-plan=abc",
  "--confirm-target=fixture-r2:bucket",
  "--confirm-bucket=bucket",
];
const open = { DATA_WRITES_FROZEN: "0" };

describe("authorizeStorageWrite", () => {
  it("admits a write that confirms the exact operation, plan, target, and bucket", () => {
    assert.doesNotThrow(() => authorizeStorageWrite(valid, expected, { env: open }));
    assert.doesNotThrow(() => authorizeStorageWrite(["--write", ...valid.slice(1).flatMap((arg) => arg.split("="))], expected, { env: open }));
  });

  it("refuses while writes are frozen, even with every confirmation", () => {
    assert.throws(() => authorizeStorageWrite(valid, expected, { env: { DATA_WRITES_FROZEN: "1" } }), /DATA_WRITES_FROZEN/);
  });

  it("refuses without --write", () => {
    assert.throws(() => authorizeStorageWrite(valid.slice(1), expected, { env: open }), /requires --write/);
  });

  for (const [index, flag] of [[1, "--confirm-write"], [2, "--confirm-plan"], [3, "--confirm-target"], [4, "--confirm-bucket"]]) {
    it(`refuses a missing, wrong, or contradicted ${flag}`, () => {
      const pattern = new RegExp(`${flag} must exactly equal`);
      assert.throws(() => authorizeStorageWrite(valid.toSpliced(index, 1), expected, { env: open }), pattern);
      assert.throws(() => authorizeStorageWrite(valid.with(index, `${flag}=other`), expected, { env: open }), pattern);
      assert.throws(() => authorizeStorageWrite([...valid, `${flag}=other`], expected, { env: open }), pattern);
    });
  }

  it("refuses when the uploader has no identity to confirm", () => {
    assert.throws(() => authorizeStorageWrite(valid, { ...expected, target: undefined }, { env: open }), /no target identity/);
    assert.throws(() => authorizeStorageWrite(valid, { ...expected, bucket: "" }, { env: open }), /no bucket identity/);
  });
});
