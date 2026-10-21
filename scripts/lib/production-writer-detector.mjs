import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const HTTP_WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SQL_WRITE_STATEMENT =
  /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|MERGE|UPSERT|DROP|ALTER|CREATE|GRANT|REVOKE)\b/i;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MODULE_EXTENSIONS = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.mjs", "/index.js"];
const LIBRARY_ROOTS = ["lib/", "server/"];
const FREEZE_GUARD = "assertDataWritesNotFrozen";
const CHILD_PROCESS_LAUNCHERS = new Set(["spawn", "spawnSync", "execFile", "execFileSync", "exec", "execSync"]);
const PACKAGE_RUNNERS = new Set(["bunx", "npx"]);
const SUBPROCESS_WRITE_VERBS = new Map([
  ["rclone", new Set(["copy", "copyto", "sync", "move", "moveto", "delete", "deletefile", "purge", "rcat"])],
  ["drizzle-kit", new Set(["migrate", "push", "drop"])],
]);

function propertyNameText(node) {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return null;
}

function evaluateStaticString(node, constants) {
  if (!node) return null;
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isIdentifier(node)) {
    return constants.get(node.text) ?? null;
  }
  if (ts.isParenthesizedExpression(node)) {
    return evaluateStaticString(node.expression, constants);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = evaluateStaticString(node.left, constants);
    const right = evaluateStaticString(node.right, constants);
    return left === null || right === null ? null : left + right;
  }
  if (ts.isTemplateExpression(node)) {
    let value = node.head.text;
    for (const span of node.templateSpans) {
      const expression = evaluateStaticString(span.expression, constants);
      if (expression === null) return null;
      value += expression + span.literal.text;
    }
    return value;
  }
  return null;
}

function collectInitializers(sourceFile) {
  const initializers = new Map();
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      !initializers.has(node.name.text)
    ) {
      initializers.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return initializers;
}

function leadingLiteralText(node, initializers, seen = new Set()) {
  if (!node) return null;
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) return node.head.text;
  if (ts.isParenthesizedExpression(node)) {
    return leadingLiteralText(node.expression, initializers, seen);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return leadingLiteralText(node.left, initializers, seen);
  }
  if (ts.isIdentifier(node) && !seen.has(node.text)) {
    seen.add(node.text);
    return leadingLiteralText(initializers.get(node.text), initializers, seen);
  }
  return null;
}

function isQueryMember(node, constants) {
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text === "query";
  }
  if (ts.isElementAccessExpression(node)) {
    return evaluateStaticString(node.argumentExpression, constants) === "query";
  }
  return false;
}

function collectConstants(sourceFile) {
  const declarations = [];
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      declarations.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  const constants = new Map();
  let changed = true;
  while (changed) {
    changed = false;
    for (const declaration of declarations) {
      if (constants.has(declaration.name.text)) continue;
      const value = evaluateStaticString(declaration.initializer, constants);
      if (value !== null) {
        constants.set(declaration.name.text, value);
        changed = true;
      }
    }
  }
  return constants;
}

function isMutationMember(node, constants) {
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text === "mutation";
  }
  if (ts.isElementAccessExpression(node)) {
    return evaluateStaticString(node.argumentExpression, constants) === "mutation";
  }
  return false;
}

function parseSource(source, fileName) {
  const scriptKind = /\.tsx?$/.test(fileName) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
}

function isFunctionLike(node) {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node);
}

function callsFreezeGuardDirectly(body) {
  let found = false;
  function visit(node) {
    if (found || (node !== body && isFunctionLike(node))) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === FREEZE_GUARD) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(body);
  return found;
}

function isExported(node) {
  return ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export;
}

const freezeGuardedExportsCache = new Map();

function freezeGuardedExports(modulePath) {
  if (freezeGuardedExportsCache.has(modulePath)) return freezeGuardedExportsCache.get(modulePath);
  const writers = new Set();
  const sourceFile = parseSource(readFileSync(modulePath, "utf8"), modulePath);
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body && isExported(statement)) {
      if (callsFreezeGuardDirectly(statement.body)) writers.add(statement.name.text);
    }
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const initializer = declaration.initializer;
        if (ts.isIdentifier(declaration.name) && initializer && isFunctionLike(initializer) && callsFreezeGuardDirectly(initializer.body)) {
          writers.add(declaration.name.text);
        }
      }
    }
  }
  freezeGuardedExportsCache.set(modulePath, writers);
  return writers;
}

function resolveRelativeModule(fileName, specifier) {
  const base = resolve(REPO_ROOT, dirname(fileName), specifier);
  for (const extension of MODULE_EXTENSIONS) {
    const candidate = base + extension;
    if (existsSync(candidate) && /\.(?:[cm]?js|tsx?)$/.test(candidate)) return candidate;
  }
  return null;
}

function collectLibraryWriterBindings(sourceFile, fileName) {
  const direct = new Set();
  const namespaces = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    const bindings = statement.importClause?.namedBindings;
    if (!specifier.startsWith(".") || !bindings || statement.importClause.isTypeOnly) continue;
    const modulePath = resolveRelativeModule(fileName, specifier);
    if (!modulePath || !LIBRARY_ROOTS.some((root) => relative(REPO_ROOT, modulePath).startsWith(root))) continue;
    const writers = freezeGuardedExports(modulePath);
    if (writers.size === 0) continue;
    if (ts.isNamespaceImport(bindings)) {
      namespaces.set(bindings.name.text, writers);
      continue;
    }
    for (const element of bindings.elements) {
      if (writers.has((element.propertyName ?? element.name).text)) direct.add(element.name.text);
    }
  }
  return { direct, namespaces };
}

function isLibraryWriterCall(node, { direct, namespaces }) {
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return direct.has(callee.text);
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    namespaces.get(callee.expression.text)?.has(callee.name.text) === true
  );
}

function launcherName(callee) {
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

function staticStrings(elements, constants) {
  const strings = [];
  for (const element of elements) {
    const value = evaluateStaticString(element, constants);
    if (value === null) break;
    strings.push(value);
  }
  return PACKAGE_RUNNERS.has(strings[0]) ? strings.slice(1) : strings;
}

function isSubprocessWriteInvocation([tool, verb], launchedTools) {
  if (SUBPROCESS_WRITE_VERBS.get(tool)?.has(verb)) return true;
  return [...launchedTools].some((launched) => SUBPROCESS_WRITE_VERBS.get(launched)?.has(tool));
}

function collectLaunchedTools(sourceFile, constants) {
  const tools = new Set();
  let launches = false;
  function visit(node) {
    if (ts.isCallExpression(node) && CHILD_PROCESS_LAUNCHERS.has(launcherName(node.expression))) {
      launches = true;
      const [command, args] = node.arguments;
      const tool = evaluateStaticString(command, constants);
      if (tool !== null && !PACKAGE_RUNNERS.has(tool)) tools.add(tool);
      if (tool !== null && PACKAGE_RUNNERS.has(tool) && args && ts.isArrayLiteralExpression(args)) {
        const [runnerTool] = staticStrings(args.elements, constants);
        if (runnerTool) tools.add(runnerTool);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return launches ? tools : null;
}

function hasDynamicFetchMethod(sourceFile, constants) {
  let found = false;
  function visit(node) {
    if (found) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "fetch") {
      for (const argument of node.arguments) {
        if (!ts.isObjectLiteralExpression(argument)) continue;
        for (const property of argument.properties) {
          const isMethod =
            (ts.isPropertyAssignment(property) && propertyNameText(property.name) === "method" && evaluateStaticString(property.initializer, constants) === null) ||
            (ts.isShorthandPropertyAssignment(property) && property.name.text === "method" && !constants.has("method"));
          if (isMethod) found = true;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

export function detectProductionWriteSignals(source, fileName = "script.mjs") {
  const sourceFile = parseSource(source, fileName);
  const constants = collectConstants(sourceFile);
  const libraryWriters = collectLibraryWriterBindings(sourceFile, fileName);
  const launchedTools = collectLaunchedTools(sourceFile, constants);
  const parameterizedFetch = hasDynamicFetchMethod(sourceFile, constants);
  const initializers = collectInitializers(sourceFile);
  const mutationAliases = new Set();

  function collectAliases(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isMutationMember(node.initializer, constants)
    ) {
      mutationAliases.add(node.name.text);
    }
    ts.forEachChild(node, collectAliases);
  }
  collectAliases(sourceFile);

  const signals = [];
  function add(kind, node) {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    signals.push({ kind, line: position.line + 1, column: position.character + 1 });
  }

  function visit(node) {
    if (launchedTools && ts.isArrayLiteralExpression(node)) {
      if (isSubprocessWriteInvocation(staticStrings(node.elements, constants), launchedTools)) {
        add("subprocess-write", node);
      }
    }

    if (ts.isCallExpression(node)) {
      if (isLibraryWriterCall(node, libraryWriters)) {
        add("library-write", node);
      }

      if (
        parameterizedFetch &&
        ts.isIdentifier(node.expression) &&
        HTTP_WRITE_METHODS.has(evaluateStaticString(node.arguments[0], constants)?.toUpperCase())
      ) {
        add("http-write", node);
      }

      if (
        isMutationMember(node.expression, constants) ||
        (ts.isIdentifier(node.expression) && mutationAliases.has(node.expression.text))
      ) {
        add("data-mutation", node);
      }

      if (isQueryMember(node.expression, constants)) {
        const statement = leadingLiteralText(node.arguments[0], initializers);
        if (statement !== null && SQL_WRITE_STATEMENT.test(statement)) {
          add("raw-sql-write", node);
        }
      }

      for (const argument of node.arguments) {
        if (!ts.isObjectLiteralExpression(argument)) continue;
        for (const property of argument.properties) {
          let method = null;
          if (
            ts.isPropertyAssignment(property) &&
            propertyNameText(property.name) === "method"
          ) {
            method = evaluateStaticString(property.initializer, constants)?.toUpperCase();
          } else if (
            ts.isShorthandPropertyAssignment(property) &&
            property.name.text === "method"
          ) {
            method = constants.get(property.name.text)?.toUpperCase();
          }
          if (method && HTTP_WRITE_METHODS.has(method)) {
            add("http-write", node);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  return {
    fileName,
    kinds: [...new Set(signals.map(({ kind }) => kind))],
    signals,
  };
}
