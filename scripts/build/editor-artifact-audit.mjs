import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { isDataBrowserClient, isEditorOnly } from "./public-editor-boundary.mjs";

let serverRuntimeIncludes;

/** Trace the complete dependency closure, not just the missing context entrypoint. */
export function getServerRuntimeIncludes() {
  return serverRuntimeIncludes ??= (async () => {
    const root = process.cwd();
    const require = createRequire(path.join(root, "package.json"));
    const { nodeFileTrace } = require("next/dist/compiled/@vercel/nft");
    const runtime = require.resolve("next/dist/compiled/next-server/pages.runtime.prod.js");
    const { fileList } = await nodeFileTrace([runtime], { base: root, processCwd: root });
    const loader = require.resolve("next/dist/server/route-modules/pages/module.compiled.js");
    fileList.add(path.relative(root, loader));
    const contexts = path.join(path.dirname(loader), "vendored/contexts");
    for (const file of fs.readdirSync(contexts)) {
      if (file.endsWith(".js")) fileList.add(path.relative(root, path.join(contexts, file)));
    }
    return [...fileList].sort().map((file) => `./${file}`);
  })();
}

export class EditorArtifactAudit {
  constructor({ editorBuild, directory }) {
    this.editorBuild = editorBuild;
    this.directory = directory;
  }

  apply(compiler) {
    compiler.hooks.afterEmit.tap("EditorArtifactAudit", (compilation) => {
      const editorModules = [];
      const replacedModules = [];
      const dataBrowserModules = [];
      const seen = new Set();
      const inspect = (module, chunkOwner = module) => {
        if (seen.has(module)) return;
        seen.add(module);
        if (module.resource) {
          const relative = path.relative(compiler.context, module.resource).replaceAll("\\", "/");
          if (isEditorOnly(module.resource)) {
            if (module.buildInfo?.publicEditorReplacement) replacedModules.push(relative);
            else {
              const chunks = [...compilation.chunkGraph.getModuleChunksIterable(chunkOwner)];
              editorModules.push({ module: relative, files: [...new Set(chunks.flatMap((chunk) => [...chunk.files]))].sort() });
            }
          }
          if (isDataBrowserClient(module.resource)) dataBrowserModules.push(relative);
        }
        if (module.modules) for (const child of module.modules) inspect(child, module);
      };
      for (const module of compilation.modules) inspect(module);
      if (!this.editorBuild && editorModules.length) {
        throw new Error(`Public artifact contains editorial browser modules: ${editorModules.map((entry) => entry.module).join(", ")}`);
      }
      // A public reader must read published data, never open its own Postgres
      // query or socket. The editorial build is where a live subscription belongs.
      if (!this.editorBuild && dataBrowserModules.length) {
        throw new Error(`Public artifact contains a browser Postgres client: ${[...new Set(dataBrowserModules)].sort().join(", ")}`);
      }
      const assets = compilation.getAssets().filter(({ name }) => /\.(?:js|css)$/.test(name)).map(({ name }) => {
        const bytes = fs.readFileSync(path.join(compiler.outputPath, name));
        return { path: `/_next/${name}`, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
      });
      fs.mkdirSync(this.directory, { recursive: true });
      fs.writeFileSync(path.join(this.directory, "editor-artifact-audit.json"), JSON.stringify({
        version: 1,
        surface: this.editorBuild ? "editor" : "public",
        accessBoundary: "application-auth",
        editorModules,
        replacedModules: [...new Set(replacedModules)].sort(),
        dataBrowserModules: [...new Set(dataBrowserModules)].sort(),
        assets,
      }, null, 2));
    });
  }
}

// Compilation alone can succeed with no middleware entry when it is outside src/app's parent.
export function verifyCompletedArtifact(directory, surface) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "server/middleware-manifest.json"), "utf8"));
  const middleware = manifest.middleware?.["/"];
  const paths = ["/lsd", "/sign-in", "/api/dev/article-lifecycle", "/_next/static/chunks/editor.js"];
  if (!middleware?.files?.length || !paths.every((pathname) =>
    middleware.matchers?.some((matcher) => new RegExp(matcher.regexp).test(pathname)))) {
    throw new Error("Release artifact has no complete middleware gate. Documents, APIs and static assets must traverse src/middleware.ts.");
  }
  for (const file of middleware.files) {
    if (!fs.existsSync(path.join(directory, file))) throw new Error(`Compiled middleware file is missing: ${file}`);
  }
  const auditPath = path.join(directory, "editor-artifact-audit.json");
  const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
  if (
    audit.surface !== surface ||
    (surface === "public" && (audit.editorModules.length || audit.dataBrowserModules?.length))
  ) {
    throw new Error("Browser artifact does not match its declared public/editor boundary.");
  }
  audit.middleware = { registered: true, files: middleware.files, matchers: middleware.matchers };
  fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2));
  console.log(
    `[editor-artifact] ${surface}: middleware registered; ${audit.editorModules.length} editorial browser modules; ${audit.dataBrowserModules?.length ?? 0} browser Postgres clients.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  nextEnv.loadEnvConfig(process.cwd(), false);
  const surface = process.env.DOSEWIKI_BUILD_SURFACE ?? "public";
  if (surface !== "public" && surface !== "editor") throw new Error("Choose a public or editor build surface.");
  const directory = process.env.DOSEWIKI_BUILD_DIR ?? (surface === "editor" ? ".next-editor" : ".next");
  verifyCompletedArtifact(path.resolve(directory), surface);
}
