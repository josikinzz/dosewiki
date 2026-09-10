/**
 * Generates `lib/postgres/runtime/functions.generated.ts`: one static import per
 * Convex function module so the Postgres runtime can resolve `api.x.y`
 * references (`"x:y"`) to the registered handler without dynamic imports.
 *
 * bun scripts/postgres/generateFunctionRegistry.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT = path.join(ROOT, "lib/postgres/runtime/functions.generated.ts");
const EXCLUDED = new Set(["schema.ts", "crons.ts", "http.ts", "convex.config.ts"]);

const modules = fs
  .readdirSync(path.join(ROOT, "convex"))
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts") && !EXCLUDED.has(name))
  .map((name) => name.slice(0, -3))
  .sort();

const lines = [
  "// GENERATED FILE. Do not edit by hand.",
  "// Source: convex/*.ts. Rerun with `npm run generate:postgres-functions`.",
  "",
  ...modules.map((name) => `import * as ${name} from "../../../convex/${name}";`),
  "",
  "/** Convex function modules keyed by their Convex module path. */",
  "export const functionModules: Record<string, Record<string, unknown>> = {",
  ...modules.map((name) => `  ${name},`),
  "};",
  "",
];

fs.writeFileSync(OUTPUT, lines.join("\n"));
console.log(`Wrote ${path.relative(ROOT, OUTPUT)}: ${modules.length} modules`);
