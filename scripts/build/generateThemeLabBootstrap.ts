#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const outputPath = "src/features/theme-lab/themeLabBootstrap.generated.json";
const hashPath = "src/features/theme-lab/themeLabBootstrapHash.generated.json";
const result = await Bun.build({
  entrypoints: ["src/features/theme-lab/themeLabBootstrap.ts"],
  target: "browser",
  format: "iife",
  minify: true,
  define: { "process.env.NEXT_PUBLIC_SITE_FLAVOR": JSON.stringify("dosewiki") },
});
if (!result.success) throw new AggregateError(result.logs, "Theme Lab bootstrap compilation failed");
const script = (await result.outputs[0].text()).replace(/<\/script/gi, "<\\/script");
const hash = `'sha256-${createHash("sha256").update(script).digest("base64")}'`;
for (const [path, value] of [[outputPath, { script }], [hashPath, { hash }]] as const) {
  const content = `${JSON.stringify(value)}\n`;
  let current: string | null = null;
  try { current = readFileSync(path, "utf8"); } catch {}
  if (current !== content) {
    if (process.argv.includes("--check")) throw new Error(`${path} is stale`);
    writeFileSync(path, content);
  }
}
console.log(`${outputPath}: ${Buffer.byteLength(script)} bytes`);
