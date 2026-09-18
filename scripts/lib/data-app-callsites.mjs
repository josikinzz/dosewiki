/**
 * Enumerate the Postgres functions the app actually calls.
 *
 * This is the set whose absence from a deployment breaks a user. It is not the
 * same as "what the checkout defines": a function can be undeployed and harm
 * nobody, while one undeployed function that a shipped page calls is an outage.
 *
 * Two call forms exist in this repo and they carry very different risk:
 *
 *   1. `api.substanceIndex.getBySlug` — typed against `lib/postgres/runtime/api`,
 *      so a checkout-internal mismatch is already a typecheck failure.
 *   2. `functionName: "substanceIndex:getPublicBySlug"` — the server-side public
 *      reads in `lib/data/publicData.reads.ts` address functions by STRING.
 *      Nothing typechecks those. They are what renders the public site.
 *
 * Both are collected. String literals are only accepted when their module half
 * names a module the checkout actually has, which is what keeps ordinary text
 * out of the result.
 */

import ts from "typescript";

const MODULE_QUALIFIED = /^[A-Za-z][\w-]*(?:\/[A-Za-z][\w-]*)*:[A-Za-z]\w*$/;

/** `api.substanceIndex.getBySlug` -> `substanceIndex.js:getBySlug`. */
function identifierFromApiChain(segments) {
  if (segments.length < 2) return null;
  const name = segments[segments.length - 1];
  const modulePath = segments.slice(0, -1).join("/");
  return `${modulePath}.js:${name}`;
}

/** `substanceIndex:getBySlug` -> `substanceIndex.js:getBySlug`. */
export function identifierFromFunctionName(functionName) {
  const [modulePath, name] = functionName.split(":");
  return `${modulePath}.js:${name}`;
}

function apiRootNames(sourceFile) {
  const roots = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteralLike(statement.moduleSpecifier)) continue;
    if (!/(?:^|\/)postgres\/runtime\/api(?:\.[cm]?[jt]s)?$/.test(statement.moduleSpecifier.text)) continue;

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if ((element.propertyName ?? element.name).text === "api") {
        roots.add(element.name.text);
      }
    }
  }
  return roots;
}

/** Flatten `a.b.c` into ["a","b","c"], or null if any link is computed. */
function propertyChain(node) {
  const segments = [];
  let current = node;
  while (ts.isPropertyAccessExpression(current)) {
    segments.unshift(current.name.text);
    current = current.expression;
  }
  if (!ts.isIdentifier(current)) return null;
  segments.unshift(current.text);
  return segments;
}

/**
 * @param {{ filePath: string, source: string, knownModules?: Set<string> }} input
 * @returns {{ identifier: string, form: "api"|"string", filePath: string }[]}
 */
export function collectFileCallsites({ filePath, source, knownModules = new Set() }) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    /\.tsx$/.test(filePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const roots = apiRootNames(sourceFile);
  const found = new Map();

  function record(identifier, form) {
    if (!found.has(identifier)) found.set(identifier, { identifier, form, filePath });
  }

  function visit(node) {
    if (ts.isPropertyAccessExpression(node)) {
      const segments = propertyChain(node);
      if (segments && roots.has(segments[0])) {
        const identifier = identifierFromApiChain(segments.slice(1));
        if (identifier) record(identifier, "api");
        // The whole chain is consumed; nothing inside it is a separate call.
        return;
      }
    }

    if (ts.isStringLiteralLike(node) && MODULE_QUALIFIED.test(node.text)) {
      const [modulePath] = node.text.split(":");
      if (knownModules.has(`${modulePath}.js`)) {
        record(identifierFromFunctionName(node.text), "string");
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...found.values()];
}

/**
 * @param {{ files: {filePath: string, source: string}[], knownModules?: Set<string> }} input
 */
export function collectAppCallsites({ files, knownModules = new Set() }) {
  const byIdentifier = new Map();
  for (const { filePath, source } of files) {
    for (const callsite of collectFileCallsites({ filePath, source, knownModules })) {
      const existing = byIdentifier.get(callsite.identifier);
      if (existing) {
        existing.files.push(callsite.filePath);
        existing.forms.add(callsite.form);
        continue;
      }
      byIdentifier.set(callsite.identifier, {
        identifier: callsite.identifier,
        forms: new Set([callsite.form]),
        files: [callsite.filePath],
      });
    }
  }

  return [...byIdentifier.values()]
    .map((entry) => ({
      identifier: entry.identifier,
      forms: [...entry.forms].sort(),
      files: entry.files.sort(),
    }))
    .sort((a, b) => a.identifier.localeCompare(b.identifier));
}
