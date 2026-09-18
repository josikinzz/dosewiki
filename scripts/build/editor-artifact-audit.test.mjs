import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { EditorArtifactAudit, getServerRuntimeIncludes, verifyCompletedArtifact } from "./editor-artifact-audit.mjs";
import { isDataBrowserClient } from "./public-editor-boundary.mjs";
import assert from "node:assert/strict";

const execute = promisify(execFile);

test("traced server runtime loads its router context without the workstation's dependencies", async () => {
  const isolated = await fs.mkdtemp(path.join(os.tmpdir(), "dosewiki-server-runtime-"));
  try {
    for (const file of await getServerRuntimeIncludes()) {
      const destination = path.join(isolated, file);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(path.resolve(file), destination);
    }
    const context = path.join(isolated, "node_modules/next/dist/server/route-modules/pages/vendored/contexts/app-router-context.js");
    await execute(process.execPath, [
      "-e",
      [
        "const requireRuntime = require('node:module').createRequire(process.argv[1]);",
        "const { AppRouterContext } = requireRuntime(process.argv[1]);",
        "const { jsx } = requireRuntime('react/jsx-runtime');",
        "const { renderToStaticMarkup } = requireRuntime('react-dom/server.edge');",
        "const tree = jsx(AppRouterContext.Provider, { value: null, children: jsx('p', { children: 'Runtime ready' }) });",
        "if (renderToStaticMarkup(tree) !== '<p>Runtime ready</p>') throw new Error('Router context render failed');",
      ].join(" "),
      context,
    ], { cwd: isolated, env: { NODE_ENV: "production" } });
  } finally {
    await fs.rm(isolated, { recursive: true, force: true });
  }
});

test("public artifact audit separates the browser Convex client from the server transport", () => {
  for (const resource of [
    "/repo/node_modules/convex/dist/esm/react/index.js",
    "/repo/node_modules/convex/dist/cjs/react/client.js",
    "/repo/node_modules/convex/react.js",
    "C:\\repo\\node_modules\\convex\\dist\\esm\\react\\index.js",
  ]) {
    assert.equal(isDataBrowserClient(resource), true, resource);
  }
  for (const resource of [
    "/repo/node_modules/convex/dist/esm/browser/http_client.js",
    "/repo/node_modules/convex/dist/esm/values/index.js",
    "/repo/node_modules/react/index.js",
    "/repo/src/features/dev/context/DevModeContext.tsx",
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
