/** Pure inventory of native Postgres callables defined in the checkout. */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/** Owned native function builders. */
const DATA_FUNCTION_BUILDERS = Object.freeze({
  query: { functionType: "Query", visibility: "public" },
  mutation: { functionType: "Mutation", visibility: "public" },
  action: { functionType: "Action", visibility: "public" },
  internalQuery: { functionType: "Query", visibility: "internal" },
  internalMutation: { functionType: "Mutation", visibility: "internal" },
  internalAction: { functionType: "Action", visibility: "internal" },
})

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

/**
 * `server/lib/auth.ts` -> `lib/auth.js`, the module portion of a native
 * callable identifier (`substanceIndex.js:getBySlug`).
 */
export function dataModuleIdFromPath(relativePath) {
  const normalized = relativePath.split(path.sep).join("/").replace(/^server\//, "");
  return `${normalized.replace(/\.(?:tsx?|jsx?|mjs)$/, "")}.js`;
}

function importedBuilderNames(sourceFile) {
  /** local identifier -> builder key */
  const names = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteralLike(statement.moduleSpecifier)) continue;
    if (!/(?:postgres\/runtime\/server|lib\/indexedMutation)(?:\.[jt]s)?$/.test(statement.moduleSpecifier.text)) continue;

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;

    for (const element of bindings.elements) {
      // `import type { MutationCtx }` and `import { type MutationCtx }` never
      // produce a runtime function.
      if (element.isTypeOnly || statement.importClause?.isTypeOnly) continue;
      const exported = (element.propertyName ?? element.name).text;
      if (!Object.hasOwn(DATA_FUNCTION_BUILDERS, exported)) continue;
      names.set(element.name.text, exported);
    }
  }
  return names;
}

/**
 * Enumerate the native data handlers one module defines.
 * The runtime registers top-level exported consts initialised by an owned
 * function builder, so that is exactly what this matches.
 */
export function collectModuleFunctions({ modulePath, source }) {
  const moduleId = dataModuleIdFromPath(modulePath);
  const sourceFile = ts.createSourceFile(
    modulePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const builders = importedBuilderNames(sourceFile);
  if (builders.size === 0) return [];

  const functions = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const isExported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!isExported) continue;

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      const initializer = declaration.initializer;
      if (!initializer || !ts.isCallExpression(initializer)) continue;
      if (!ts.isIdentifier(initializer.expression)) continue;

      const builder = builders.get(initializer.expression.text);
      if (!builder) continue;

      const { functionType, visibility } = DATA_FUNCTION_BUILDERS[builder];
      functions.push({
        identifier: `${moduleId}:${declaration.name.text}`,
        module: moduleId,
        name: declaration.name.text,
        functionType,
        visibility,
      });
    }
  }
  return functions;
}

/** Recursively list source files, skipping generated code, tests, and `_dirs`. */
export function walkSourceFiles(dir, { skipTests = true } = {}) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }

  for (const entry of entries.sort()) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      if (entry.startsWith("_") || entry === "node_modules" || entry === "__tests__") continue;
      files.push(...walkSourceFiles(fullPath, { skipTests }));
      continue;
    }
    if (entry.endsWith(".d.ts")) continue;
    if (skipTests && TEST_FILE.test(entry)) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(entry))) continue;
    files.push(fullPath);
  }
  return files;
}

/** Every Postgres function this checkout defines, sorted by identifier. */
export function collectCheckoutInventory({ repoRoot, serverDir = "server" }) {
  const absoluteServerDir = path.resolve(repoRoot, serverDir);
  const functions = [];
  for (const file of walkSourceFiles(absoluteServerDir)) {
    const relativePath = path.relative(absoluteServerDir, file);
    functions.push(
      ...collectModuleFunctions({
        modulePath: relativePath,
        source: readFileSync(file, "utf8"),
      }),
    );
  }
  return functions.sort((a, b) => a.identifier.localeCompare(b.identifier));
}

