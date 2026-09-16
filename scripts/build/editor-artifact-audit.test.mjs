import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { getServerRuntimeIncludes } from "./editor-artifact-audit.mjs";
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
