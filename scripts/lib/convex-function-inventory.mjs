/**
 * Compare the Convex functions this checkout defines against the ones a live
 * deployment actually exposes.
 *
 * Why this exists: the app build never deploys Convex functions. `vercel.json`
 * runs `bun install` / `bun run build`, and `build` is plain `next build`;
 * functions only move on an explicit `convex deploy`. So a merged, built,
 * deployed release can call a mutation that exists in the checkout and on dev
 * but was never published to production. Production redacts every error to a
 * bare "Server Error", so the failure is invisible to runtime probing — the
 * only workable detection is a static comparison of two inventories.
 *
 * Drift runs both ways:
 *   - checkout has it, deployment does not  -> the outage (a shipped UI calls a
 *     function that is not there)
 *   - deployment has it, checkout does not  -> the silent-deletion hazard, since
 *     `convex deploy` publishes the WORKING TREE and drops anything absent
 *     from it (see docs/agents/deployment.md)
 *
 * This module is pure: it parses sources and JSON and returns data. Reaching a
 * deployment, printing, and exit codes belong to the callers
 * (`scripts/convex/check-function-drift.mjs`, `scripts/convex/doctor.mjs`).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * The function builders `convex/_generated/server` exports. `internal*` variants
 * are not client-callable, but `convex function-spec` lists them, so the
 * checkout side must recognise them too or the deployment-has-it direction
 * reports every internal mutation as a phantom deletion.
 */
const CONVEX_FUNCTION_BUILDERS = Object.freeze({
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
 * `convex/lib/auth.ts` -> `lib/auth.js`, matching how a deployment identifies
 * its own functions (`substanceIndex.js:getBySlug`).
 */
export function convexModuleIdFromPath(relativePath) {
  const normalized = relativePath.split(path.sep).join("/").replace(/^convex\//, "");
  return `${normalized.replace(/\.(?:tsx?|jsx?|mjs)$/, "")}.js`;
}

/** `https://glad-minnow-656.convex.cloud` -> `glad-minnow-656`. */
export function deploymentNameFromUrl(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.split(".")[0];
  } catch {
    return url;
  }
}

function importedBuilderNames(sourceFile) {
  /** local identifier -> builder key */
  const names = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteralLike(statement.moduleSpecifier)) continue;
    if (!/(?:_generated\/server|lib\/indexedMutation)(?:\.js)?$/.test(statement.moduleSpecifier.text)) continue;

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;

    for (const element of bindings.elements) {
      // `import type { MutationCtx }` and `import { type MutationCtx }` never
      // produce a runtime function.
      if (element.isTypeOnly || statement.importClause?.isTypeOnly) continue;
      const exported = (element.propertyName ?? element.name).text;
      if (!Object.hasOwn(CONVEX_FUNCTION_BUILDERS, exported)) continue;
      names.set(element.name.text, exported);
    }
  }
  return names;
}

/**
 * Enumerate the Convex functions one module source defines.
 * Convex only registers top-level exported consts initialised by a builder, so
 * that is exactly what this matches.
 */
export function collectModuleFunctions({ modulePath, source }) {
  const moduleId = convexModuleIdFromPath(modulePath);
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

      const { functionType, visibility } = CONVEX_FUNCTION_BUILDERS[builder];
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

/** Every Convex function this checkout defines, sorted by identifier. */
export function collectCheckoutInventory({ repoRoot, convexDir = "convex" }) {
  const absoluteConvexDir = path.resolve(repoRoot, convexDir);
  const functions = [];
  for (const file of walkSourceFiles(absoluteConvexDir)) {
    const relativePath = path.relative(absoluteConvexDir, file);
    functions.push(
      ...collectModuleFunctions({
        modulePath: relativePath,
        source: readFileSync(file, "utf8"),
      }),
    );
  }
  return functions.sort((a, b) => a.identifier.localeCompare(b.identifier));
}

/**
 * Normalise `convex function-spec` output. The payload carries the deployment
 * URL, which is the only trustworthy statement of which deployment answered —
 * a deploy key overrides `--prod` and `CONVEX_DEPLOYMENT`, so the caller's
 * intent is not evidence.
 */
export function parseFunctionSpec(raw) {
  const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
  const entries = Array.isArray(payload) ? payload : (payload?.functions ?? []);
  const url = Array.isArray(payload) ? null : (payload?.url ?? null);

  const functions = entries
    .map((entry) => ({
      identifier: entry.identifier,
      functionType: entry.functionType ?? null,
      visibility: entry.visibility?.kind ?? null,
    }))
    .filter((entry) => typeof entry.identifier === "string")
    .sort((a, b) => a.identifier.localeCompare(b.identifier));

  return { deploymentUrl: url, deploymentName: deploymentNameFromUrl(url), functions };
}

/** Both drift directions plus visibility changes, which silently break callers. */
export function diffFunctionInventories({ checkout, deployment }) {
  const deploymentByIdentifier = new Map(
    deployment.map((entry) => [entry.identifier, entry]),
  );
  const checkoutByIdentifier = new Map(checkout.map((entry) => [entry.identifier, entry]));

  const missingFromDeployment = checkout
    .filter((entry) => !deploymentByIdentifier.has(entry.identifier))
    .map(({ identifier, functionType, visibility }) => ({
      identifier,
      functionType,
      visibility,
    }));

  const missingFromCheckout = deployment
    .filter((entry) => !checkoutByIdentifier.has(entry.identifier))
    .map(({ identifier, functionType, visibility }) => ({
      identifier,
      functionType,
      visibility,
    }));

  const visibilityMismatches = [];
  for (const entry of checkout) {
    const live = deploymentByIdentifier.get(entry.identifier);
    if (!live || !live.visibility) continue;
    if (live.visibility !== entry.visibility) {
      visibilityMismatches.push({
        identifier: entry.identifier,
        checkout: entry.visibility,
        deployment: live.visibility,
      });
    }
  }

  return { missingFromDeployment, missingFromCheckout, visibilityMismatches };
}
