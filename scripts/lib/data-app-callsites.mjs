import ts from "typescript";

const MODULE_QUALIFIED = /^[A-Za-z][\w-]*(?:\/[A-Za-z][\w-]*)*:[A-Za-z]\w*$/;

function identifierFromApiChain(segments) {
  if (segments.length < 2) return null;
  const name = segments[segments.length - 1];
  const modulePath = segments.slice(0, -1).join("/");
  return `${modulePath}.js:${name}`;
}

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
