#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

import { productionWriterClassifications } from "../lib/production-writer-inventory.mjs";

const IMPORT_PATTERN = /import\s*\{([^}]*)\}\s*from\s*"([^"]*production-write-command\.mjs)";/;
const PRINT_PATTERN = /^([ \t]*)printProductionWriteCommand\(([\w.]+)\);[ \t]*$/m;

function authorize(source, path) {
  const print = source.match(PRINT_PATTERN);
  if (!print) throw new Error(`${path}: no printProductionWriteCommand(<command>); statement to anchor the authorizer.`);
  const [printLine, indent, commandExpr] = print;
  const creation = source.match(/createProductionWriteCommand\(\{([^}]*)\}\)/);
  if (!creation) throw new Error(`${path}: no createProductionWriteCommand({ ... }) call.`);
  if (/\benv\s*:/.test(creation[1])) throw new Error(`${path}: a renamed env option needs a manual edit.`);
  const envOption = /\benv\b/.test(creation[1]) ? ", { env }" : "";

  const gate = `${indent}if (${commandExpr}.writeRequested) authorizeProductionWrite(${commandExpr}${envOption});`;
  const lateAssertion = new RegExp(`^[ \\t]*assertProductionWriteAllowed\\(${commandExpr.replace(".", "\\.")}\\);[ \\t]*\\n`, "gm");
  const next = source.replace(printLine, `${printLine}\n${gate}`).replace(lateAssertion, "");
  if (next.includes("assertProductionWriteAllowed(")) {
    throw new Error(`${path}: an assertProductionWriteAllowed call on another value needs a manual edit.`);
  }
  return next.replace(IMPORT_PATTERN, (statement, names, specifier) => {
    const imported = names.split(",").map((name) => name.trim()).filter((name) => name && name !== "assertProductionWriteAllowed");
    const sorted = [...new Set([...imported, "authorizeProductionWrite"])].sort();
    return `import {\n${sorted.map((name) => `  ${name},`).join("\n")}\n} from "${specifier}";`;
  });
}

const check = process.argv.includes("--check");
const { productionBoundary, guardedIndirectEntrypoint } = productionWriterClassifications;
const pending = [...new Set([...productionBoundary, ...guardedIndirectEntrypoint])]
  .filter((path) => !path.startsWith("scripts/translation/"))
  .filter((path) => {
    const source = readFileSync(path, "utf8");
    return IMPORT_PATTERN.test(source) && !source.includes("authorizeProductionWrite(");
  });
for (const path of pending) {
  if (!check) writeFileSync(path, authorize(readFileSync(path, "utf8"), path));
  console.log(`${check ? "needs authorizer" : "authorized"}: ${path}`);
}
console.log(`${pending.length} writer(s) ${check ? "lack" : "now call"} authorizeProductionWrite.`);
if (check && pending.length > 0) process.exitCode = 1;
