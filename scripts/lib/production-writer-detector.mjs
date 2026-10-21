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
const CHILD_PROCESS_MODULES = new Set(["child_process", "node:child_process"]);
const CHILD_PROCESS_LAUNCHERS = new Set(["spawn", "spawnSync", "execFile", "execFileSync", "exec", "execSync"]);
const SHELL_LAUNCHERS = new Set(["exec", "execSync"]);
const PACKAGE_RUNNERS = new Set(["bunx", "npx"]);
const SUBPROCESS_WRITE_VERBS = new Map([
  ["rclone", new Set(["copy", "copyto", "sync", "move", "moveto", "delete", "deletefile", "purge", "rcat"])],
  ["drizzle-kit", new Set(["migrate", "push", "drop"])],
]);
const UNRESOLVED = Symbol("unresolved");

function propertyNameText(node) {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return null;
}

function unwrap(node) {
  while (
    node &&
    (ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isTypeAssertionExpression(node))
  ) {
    node = node.expression;
  }
  return node;
}

function bindSource(sourceFile) {
  const host = {
    getSourceFile: (name) => (name === sourceFile.fileName ? sourceFile : undefined),
    fileExists: (name) => name === sourceFile.fileName,
    readFile: () => undefined,
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => {},
    getCurrentDirectory: () => "/",
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
  };
  const program = ts.createProgram([sourceFile.fileName], { noLib: true, noResolve: true, allowJs: true, types: [] }, host);
  return program.getTypeChecker();
}

function declarationOf(identifier, checker) {
  const symbol = ts.isShorthandPropertyAssignment(identifier.parent) && identifier.parent.name === identifier
    ? checker.getShorthandAssignmentValueSymbol(identifier.parent)
    : checker.getSymbolAtLocation(identifier);
  return symbol?.valueDeclaration ?? symbol?.declarations?.[0] ?? null;
}

function constInitializer(identifier, checker) {
  const declaration = declarationOf(identifier, checker);
  if (!declaration || !ts.isVariableDeclaration(declaration) || !declaration.initializer) return null;
  return ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const ? declaration.initializer : null;
}

function evaluateStaticString(node, checker, seen = new Set()) {
  node = unwrap(node);
  if (!node || seen.has(node)) return null;
  seen.add(node);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isIdentifier(node)) return evaluateStaticString(constInitializer(node, checker), checker, seen);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = evaluateStaticString(node.left, checker, seen);
    const right = evaluateStaticString(node.right, checker, seen);
    return left === null || right === null ? null : left + right;
  }
  if (ts.isTemplateExpression(node)) {
    let value = node.head.text;
    for (const span of node.templateSpans) {
      const expression = evaluateStaticString(span.expression, checker, seen);
      if (expression === null) return null;
      value += expression + span.literal.text;
    }
    return value;
  }
  return null;
}

function leadingLiteralText(node, checker, seen = new Set()) {
  node = unwrap(node);
  if (!node || seen.has(node)) return null;
  seen.add(node);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return leadingLiteralText(node.left, checker, seen);
  }
  if (ts.isIdentifier(node)) return leadingLiteralText(constInitializer(node, checker), checker, seen);
  return null;
}

function isMember(node, name, checker) {
  node = unwrap(node);
  if (ts.isPropertyAccessExpression(node)) return node.name.text === name;
  if (ts.isElementAccessExpression(node)) return evaluateStaticString(node.argumentExpression, checker) === name;
  return false;
}

function isMutationCallee(callee, checker) {
  callee = unwrap(callee);
  if (isMember(callee, "mutation", checker)) return true;
  if (!ts.isIdentifier(callee)) return false;
  const initializer = constInitializer(callee, checker);
  return initializer !== null && isMember(initializer, "mutation", checker);
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

function isRequireOf(node, modules, checker) {
  node = unwrap(node);
  return (
    node !== undefined &&
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "require" &&
    modules.has(evaluateStaticString(node.arguments[0], checker) ?? "")
  );
}

function aliasedLauncher(identifier, checker) {
  const declaration = declarationOf(identifier, checker);
  if (!declaration) return null;
  if (ts.isImportSpecifier(declaration)) {
    const importDeclaration = declaration.parent.parent.parent;
    const imported = (declaration.propertyName ?? declaration.name).text;
    return CHILD_PROCESS_MODULES.has(importDeclaration.moduleSpecifier.text) && CHILD_PROCESS_LAUNCHERS.has(imported) ? imported : null;
  }
  if (ts.isBindingElement(declaration)) {
    const imported = propertyNameText(declaration.propertyName ?? declaration.name);
    const source = declaration.parent.parent;
    return ts.isVariableDeclaration(source) && isRequireOf(source.initializer, CHILD_PROCESS_MODULES, checker) && CHILD_PROCESS_LAUNCHERS.has(imported)
      ? imported
      : null;
  }
  const initializer = unwrap(constInitializer(identifier, checker));
  if (initializer && ts.isCallExpression(initializer) && /^(?:util\.)?promisify$/.test(initializer.expression.getText())) {
    return launcherOf(initializer.arguments[0], checker);
  }
  return null;
}

function launcherOf(callee, checker) {
  callee = unwrap(callee);
  if (!callee) return null;
  if (ts.isPropertyAccessExpression(callee)) {
    return CHILD_PROCESS_LAUNCHERS.has(callee.name.text) ? callee.name.text : null;
  }
  if (!ts.isIdentifier(callee)) return null;
  return aliasedLauncher(callee, checker) ?? (CHILD_PROCESS_LAUNCHERS.has(callee.text) ? callee.text : null);
}

function arrayTokens(node, checker, seen = new Set()) {
  node = unwrap(node);
  if (!node || seen.has(node)) return null;
  seen.add(node);
  if (ts.isIdentifier(node)) return arrayTokens(constInitializer(node, checker), checker, seen);
  if (ts.isArrayLiteralExpression(node)) {
    const tokens = [];
    for (const element of node.elements) {
      if (ts.isSpreadElement(element)) {
        const spread = arrayTokens(element.expression, checker, seen);
        if (spread === null) return [...tokens, UNRESOLVED];
        tokens.push(...spread);
        if (spread.includes(UNRESOLVED)) return tokens;
        continue;
      }
      tokens.push(evaluateStaticString(element, checker) ?? UNRESOLVED);
    }
    return tokens;
  }
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "slice" &&
    node.arguments.length <= 1
  ) {
    const base = arrayTokens(node.expression.expression, checker, seen);
    const start = node.arguments[0] ? Number(unwrap(node.arguments[0]).getText()) : 0;
    if (base === null || !Number.isInteger(start) || start < 0) return null;
    const unresolvedAt = base.indexOf(UNRESOLVED);
    return unresolvedAt !== -1 && unresolvedAt < start ? [UNRESOLVED] : base.slice(start);
  }
  return null;
}

function commandToken(node, checker) {
  node = unwrap(node);
  if (node && ts.isElementAccessExpression(node)) {
    const base = arrayTokens(node.expression, checker);
    const index = Number(unwrap(node.argumentExpression).getText());
    if (base !== null && Number.isInteger(index) && !base.slice(0, index).includes(UNRESOLVED)) {
      return base[index] ?? UNRESOLVED;
    }
  }
  return evaluateStaticString(node, checker) ?? UNRESOLVED;
}

function shellWords(node, checker) {
  node = unwrap(node);
  const text = evaluateStaticString(node, checker);
  if (text !== null) return text.split(/\s+/).filter(Boolean);
  if (node && ts.isIdentifier(node)) {
    const initializer = constInitializer(node, checker);
    if (initializer) return shellWords(initializer, checker);
  }
  if (node && ts.isTemplateExpression(node)) {
    const words = node.head.text.split(/\s+/).filter(Boolean);
    if (!/\s$/.test(node.head.text)) words.pop();
    return [...words, UNRESOLVED];
  }
  return [UNRESOLVED];
}

function launchArgv(call, launcher, checker) {
  const [command, args] = call.arguments;
  const argvArray = arrayTokens(command, checker);
  if (argvArray !== null) return argvArray;
  if (SHELL_LAUNCHERS.has(launcher)) return shellWords(command, checker);
  const head = commandToken(command, checker);
  if (!args || ts.isObjectLiteralExpression(unwrap(args))) return [head];
  return [head, ...(arrayTokens(args, checker) ?? [UNRESOLVED])];
}

function withoutPackageRunner(tokens) {
  return PACKAGE_RUNNERS.has(tokens[0]) ? tokens.slice(1) : tokens;
}

function classifyLaunch(argv) {
  const [tool, verb] = withoutPackageRunner(argv);
  if (typeof tool !== "string") return { unresolvedTool: null };
  const verbs = SUBPROCESS_WRITE_VERBS.get(tool);
  if (!verbs) return "read";
  if (verb === UNRESOLVED) return { unresolvedTool: tool };
  return verbs.has(verb) ? "write" : "read";
}

function isUnresolvedLaunchWriteArray(tokens, unresolvedTools) {
  const [first, second] = withoutPackageRunner(tokens);
  return [...unresolvedTools].some((tool) =>
    tool === null ? SUBPROCESS_WRITE_VERBS.get(first)?.has(second) : SUBPROCESS_WRITE_VERBS.get(tool).has(first),
  );
}

function methodExpression(property) {
  if (ts.isPropertyAssignment(property) && propertyNameText(property.name) === "method") return property.initializer;
  if (ts.isShorthandPropertyAssignment(property) && property.name.text === "method") return property.name;
  return null;
}

function requestMethods(call) {
  const methods = [];
  for (const argument of call.arguments) {
    if (!ts.isObjectLiteralExpression(argument)) continue;
    for (const property of argument.properties) {
      const expression = methodExpression(property);
      if (expression) methods.push(expression);
    }
  }
  return methods;
}

function enclosingParameterIndex(expression, checker) {
  expression = unwrap(expression);
  if (!ts.isIdentifier(expression)) return null;
  const declaration = declarationOf(expression, checker);
  if (!declaration || !ts.isParameter(declaration) || !ts.isIdentifier(declaration.name)) return null;
  return { owner: declaration.parent, index: declaration.parent.parameters.indexOf(declaration) };
}

function functionName(node) {
  if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.name) return node.name.text;
  if (ts.isMethodDeclaration(node)) return propertyNameText(node.name);
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (ts.isPropertyAssignment(parent)) return propertyNameText(parent.name);
  return null;
}

function calleeName(callee) {
  callee = unwrap(callee);
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

function collectCalls(sourceFile) {
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node)) calls.push(node);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return calls;
}

function collectMethodWrappers(calls, checker) {
  const wrappers = new Map();
  function register(parameter) {
    if (!parameter) return false;
    const name = functionName(parameter.owner);
    if (!name || wrappers.get(name)?.has(parameter.index)) return false;
    wrappers.set(name, new Set([...(wrappers.get(name) ?? []), parameter.index]));
    return true;
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const call of calls) {
      for (const expression of requestMethods(call)) {
        changed = register(enclosingParameterIndex(expression, checker)) || changed;
      }
      for (const index of wrappers.get(calleeName(call.expression)) ?? []) {
        changed = register(enclosingParameterIndex(call.arguments[index], checker)) || changed;
      }
    }
  }
  return wrappers;
}

function isWriteMethod(expression, checker) {
  return HTTP_WRITE_METHODS.has(evaluateStaticString(expression, checker)?.toUpperCase());
}

function isUnresolvedMethod(expression, checker) {
  return evaluateStaticString(expression, checker) === null && enclosingParameterIndex(expression, checker) === null;
}

export function detectProductionWriteSignals(source, fileName = "script.mjs") {
  const sourceFile = parseSource(source, fileName);
  const checker = bindSource(sourceFile);
  const libraryWriters = collectLibraryWriterBindings(sourceFile, fileName);
  const calls = collectCalls(sourceFile);
  const methodWrappers = collectMethodWrappers(calls, checker);
  const unresolvedTools = new Set();

  const signals = [];
  function add(kind, node) {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    signals.push({ kind, line: position.line + 1, column: position.character + 1 });
  }

  for (const call of calls) {
    const launcher = launcherOf(call.expression, checker);
    if (launcher) {
      const launch = classifyLaunch(launchArgv(call, launcher, checker));
      if (launch === "write") add("subprocess-write", call);
      else if (launch !== "read") unresolvedTools.add(launch.unresolvedTool);
    }

    if (isLibraryWriterCall(call, libraryWriters)) {
      add("library-write", call);
    }

    const methods = requestMethods(call);
    const forwardsUnresolvedMethod =
      calleeName(call.expression) === "fetch" && methods.some((expression) => isUnresolvedMethod(expression, checker));
    const wrapperWritesMethod = [...(methodWrappers.get(calleeName(call.expression)) ?? [])].some((index) =>
      isWriteMethod(call.arguments[index], checker),
    );
    if (forwardsUnresolvedMethod || wrapperWritesMethod || methods.some((expression) => isWriteMethod(expression, checker))) {
      add("http-write", call);
    }

    if (isMutationCallee(call.expression, checker)) {
      add("data-mutation", call);
    }

    if (isMember(call.expression, "query", checker)) {
      const statement = leadingLiteralText(call.arguments[0], checker);
      if (statement !== null && SQL_WRITE_STATEMENT.test(statement)) {
        add("raw-sql-write", call);
      }
    }
  }

  if (unresolvedTools.size > 0) {
    function visitArrays(node) {
      if (ts.isArrayLiteralExpression(node) && isUnresolvedLaunchWriteArray(arrayTokens(node, checker), unresolvedTools)) {
        add("subprocess-write", node);
      }
      ts.forEachChild(node, visitArrays);
    }
    visitArrays(sourceFile);
  }

  return {
    fileName,
    kinds: [...new Set(signals.map(({ kind }) => kind))],
    signals,
  };
}
