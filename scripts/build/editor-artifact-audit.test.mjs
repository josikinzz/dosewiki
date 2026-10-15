import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { EditorArtifactAudit, verifyCompletedArtifact } from "./editor-artifact-audit.mjs";
import { isDataBrowserClient } from "./public-editor-boundary.mjs";
import assert from "node:assert/strict";

test("public artifact audit flags the Postgres driver and nothing else", () => {
  for (const resource of [
    "/repo/node_modules/pg/lib/index.js",
    "/repo/node_modules/pg/esm/index.mjs",
    "/repo/node_modules/pg-pool/index.js",
    "/repo/node_modules/pg-protocol/dist/index.js",
    "/repo/node_modules/pg-cloudflare/dist/index.js",
    "C:\\repo\\node_modules\\pg\\lib\\client.js",
  ]) {
    assert.equal(isDataBrowserClient(resource), true, resource);
  }
  for (const resource of [
    "/repo/node_modules/pg-types/index.js",
    "/repo/node_modules/pgpass/lib/index.js",
    "/repo/node_modules/react/index.js",
    "/repo/src/features/dev/context/DevModeContext.tsx",
    "/repo/lib/postgres/runtime/values.ts",
  ]) {
    assert.equal(isDataBrowserClient(resource), false, resource);
  }
});

test("public compiler audit rejects a protected browser module", () => {
  let afterEmit;
  const audit = new EditorArtifactAudit({ editorBuild: false, directory: "unused" });
  audit.apply({
    context: process.cwd(),
    hooks: { afterEmit: { tap: (_name, callback) => { afterEmit = callback; } } },
  });
  const compilation = {
    modules: [{ resource: path.resolve("src/features/dev/context/DevModeContext.tsx") }],
    chunkGraph: { getModuleChunksIterable: () => [{ files: ["static/chunks/editor.js"] }] },
  };

  assert.throws(() => afterEmit(compilation), /Public artifact contains editorial browser modules/);
});

test("release verifier rejects incomplete gates and contaminated or mismatched artifacts", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dosewiki-artifact-verdict-"));
  try {
    await fs.mkdir(path.join(directory, "server"));
    await fs.writeFile(path.join(directory, "server/middleware.js"), "");
    const gate = { files: ["server/middleware.js"], matchers: [{ regexp: "^/.*$" }] };
    const audit = { surface: "public", editorModules: [], dataBrowserModules: [] };
    const cases = [
      { middleware: {}, audit, error: /no complete middleware gate/ },
      { middleware: { "/": { ...gate, matchers: [{ regexp: "^/lsd$" }] } }, audit, error: /no complete middleware gate/ },
      { middleware: { "/": { ...gate, files: ["server/missing.js"] } }, audit, error: /Compiled middleware file is missing/ },
      { middleware: { "/": gate }, audit: { ...audit, editorModules: [{ module: "src/features/dev/Editor.tsx" }] }, error: /public\/editor boundary/ },
      { middleware: { "/": gate }, audit: { ...audit, dataBrowserModules: ["node_modules/convex/react.js"] }, error: /public\/editor boundary/ },
      { middleware: { "/": gate }, audit: { ...audit, surface: "editor" }, error: /public\/editor boundary/ },
    ];
    for (const fixture of cases) {
      await fs.writeFile(path.join(directory, "server/middleware-manifest.json"), JSON.stringify({ middleware: fixture.middleware }));
      await fs.writeFile(path.join(directory, "editor-artifact-audit.json"), JSON.stringify(fixture.audit));
      assert.throws(() => verifyCompletedArtifact(directory, "public"), fixture.error);
    }
    await fs.writeFile(path.join(directory, "server/middleware-manifest.json"), JSON.stringify({ middleware: { "/": gate } }));
    await fs.writeFile(path.join(directory, "editor-artifact-audit.json"), JSON.stringify(audit));
    verifyCompletedArtifact(directory, "public");
    const accepted = JSON.parse(await fs.readFile(path.join(directory, "editor-artifact-audit.json"), "utf8"));
    assert.deepEqual(accepted.middleware, { registered: true, ...gate });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
