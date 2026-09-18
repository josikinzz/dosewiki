/** Generates the server registry and browser-safe typed references from owned modules. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RUNTIME = path.join(ROOT, "lib/postgres/runtime");
const SOURCE = path.join(ROOT, "server");
const EXCLUDED = new Set(["schema.ts"]);
type Ownership = { batches: Record<string, string[]>; retired: Record<string, { batch: string; replacement: string; reason: string }> };
const ownership = JSON.parse(fs.readFileSync(path.join(RUNTIME, "functionOwnership.json"), "utf8")) as Ownership;
const owners = new Map<string, string>();
for (const [batch, names] of Object.entries(ownership.batches)) {
  for (const name of names) {
    if (owners.has(name) || Object.prototype.hasOwnProperty.call(ownership.retired, name)) throw new Error(`Function module ${name} has more than one migration owner`);
    owners.set(name, batch);
  }
}
const modules = fs.readdirSync(SOURCE)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts") && !EXCLUDED.has(name))
  .map((name) => name.slice(0, -3)).sort();
for (const name of modules) {
  if (!owners.has(name)) throw new Error(`Function module ${name} has no active migration owner`);
}
for (const name of owners.keys()) {
  if (!modules.includes(name)) throw new Error(`Owned function module ${name} is missing`);
}
for (const [name, retirement] of Object.entries(ownership.retired)) {
  if (fs.existsSync(path.join(SOURCE, `${name}.ts`))) throw new Error(`Retired module ${name} still has an active source`);
  if (!fs.existsSync(path.join(ROOT, retirement.replacement))) throw new Error(`Retired module ${name} has no replacement`);
}

const header = ["// GENERATED FILE. Do not edit by hand.", "// Producer: scripts/postgres/generateFunctionRegistry.ts", "// Inputs: runtime/functionOwnership.json and owned function modules.", ""];
fs.writeFileSync(path.join(RUNTIME, "functions.generated.ts"), [
  ...header,
  ...modules.map((name) => `import * as ${name} from "../../../server/${name}";`),
  "",
  "/** Server-only callable modules. Helper exports are not callable registrations. */",
  "export const functionModules: Record<string, Record<string, unknown>> = {",
  ...modules.map((name) => `  ${name},`),
  "};", "",
].join("\n"));
fs.writeFileSync(path.join(RUNTIME, "api.generated.ts"), [
  ...header,
  'import type { ApiFromModules } from "./server";',
  ...modules.map((name) => `import type * as ${name} from "../../../server/${name}";`),
  "",
  "export type Api = ApiFromModules<{",
  ...modules.map((name) => `  ${name}: typeof ${name};`),
  "}>;", "",
].join("\n"));

console.log(`Generated owned registry and references for ${modules.length} modules; ${Object.keys(ownership.retired).length} retired modules accounted for.`);
