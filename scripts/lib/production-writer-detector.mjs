import ts from "typescript";

const HTTP_WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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

export function detectProductionWriteSignals(source, fileName = "script.mjs") {
  const scriptKind = /\.tsx?$/.test(fileName) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const constants = collectConstants(sourceFile);
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
    if (ts.isCallExpression(node)) {
      if (
        isMutationMember(node.expression, constants) ||
        (ts.isIdentifier(node.expression) && mutationAliases.has(node.expression.text))
      ) {
        add("data-mutation", node);
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
