import assert from "node:assert/strict";
import { test } from "node:test";

import { coveredDiagnostics } from "./typecheck-strict-null.mjs";

const output = [
  "lib/postgres/runtime/client.ts(12,7): error TS2322: Type 'null' is not assignable to type 'string'.",
  "server/changelog.ts(40,3): error TS18048: 'entry' is possibly 'undefined'.",
  "lib/postgres/runtimeHelpers.ts(3,1): error TS2322: Type 'null' is not assignable to type 'string'.",
  "lib/runtime/envContract.ts(88,5): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.",
  "  Type 'undefined' is not assignable to type 'string'.",
].join("\n");

test("keeps only diagnostics inside the include list, with their continuation lines", () => {
  assert.deepEqual(coveredDiagnostics(output, ["lib/postgres/runtime", "lib/runtime"]), [
    "lib/postgres/runtime/client.ts(12,7): error TS2322: Type 'null' is not assignable to type 'string'.",
    [
      "lib/runtime/envContract.ts(88,5): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.",
      "  Type 'undefined' is not assignable to type 'string'.",
    ].join("\n"),
  ]);
});

test("an include entry covers a directory, not a sibling that shares its prefix", () => {
  assert.deepEqual(coveredDiagnostics(output, ["lib/postgres/runtime"]).length, 1);
});

test("an include entry can name a single file", () => {
  assert.deepEqual(coveredDiagnostics(output, ["server/changelog.ts"]), [
    "server/changelog.ts(40,3): error TS18048: 'entry' is possibly 'undefined'.",
  ]);
});
