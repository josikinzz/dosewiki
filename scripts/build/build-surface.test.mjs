import assert from "node:assert/strict";
import test from "node:test";

import {
  keepPublicBuildInputs,
} from "./build-surface.mjs";

test("only NEXT_PUBLIC_* and NODE_OPTIONS lines survive as build inputs", () => {
  const pulled = [
    'NEXT_PUBLIC_SITE_FLAVOR="effectindex"',
    'POSTGRES_POOLED_URL="postgres://secret"',
    'NODE_OPTIONS="--max-old-space-size=8192"',
    'DATA_ADMIN_KEY="secret"',
    'NEXT_PUBLIC_lower="kept only when upper case"',
    'NEXT_PUBLIC_SITE_URL="https://dose.wiki"',
    '# NEXT_PUBLIC_COMMENTED="no"',
    ' NEXT_PUBLIC_INDENTED="no"',
    'NODE_OPTIONS_EXTRA="no"',
  ].join("\n");
  assert.equal(
    keepPublicBuildInputs(pulled),
    [
      'NEXT_PUBLIC_SITE_FLAVOR="effectindex"',
      'NODE_OPTIONS="--max-old-space-size=8192"',
      'NEXT_PUBLIC_SITE_URL="https://dose.wiki"',
    ].join("\n"),
  );
  assert.equal(keepPublicBuildInputs(""), "");
});
