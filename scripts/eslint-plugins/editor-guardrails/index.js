/**
 * ESLint Plugin: Editor Guardrails
 *
 * Keeps dev tools and in-page editors on the shared unsaved-work guard and
 * confirmation dialog instead of per-tool copies:
 * - no raw `beforeunload` listener or `onbeforeunload` handler
 * - no native `window.confirm`
 * - no hand-rolled confirmation built from the Dialog or AlertDialog primitives
 *
 * The rule has no path logic of its own; eslint.config.mjs scopes it to the
 * editor folders and exempts the shared implementations.
 */

const DIALOG_SOURCES = new Set(['@/components/ui/dialog', '@radix-ui/react-dialog']);
const ALERT_DIALOG_SOURCES = new Set(['@/components/ui/alert-dialog', '@radix-ui/react-alert-dialog']);
const TITLE_EXPORTS = new Set(['DialogTitle', 'Title']);
const WINDOW_OBJECTS = new Set(['window', 'globalThis', 'self']);

function staticPropertyName(node) {
  if (!node.computed && node.property?.type === 'Identifier') return node.property.name;
  if (node.computed && node.property?.type === 'Literal' && typeof node.property.value === 'string') {
    return node.property.value;
  }
  return null;
}

function staticString(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

/** The last piece of literal text a JSX element renders, or null when it ends in an expression. */
function trailingText(element) {
  for (let index = element.children.length - 1; index >= 0; index -= 1) {
    const child = element.children[index];
    if (child.type === 'JSXText') {
      if (child.value.trim() === '') continue;
      return child.value.trim();
    }
    if (child.type === 'JSXExpressionContainer') {
      const expression = child.expression;
      if (expression.type === 'JSXEmptyExpression') continue;
      if (expression.type === 'TemplateLiteral') {
        return expression.quasis[expression.quasis.length - 1].value.cooked.trim() || null;
      }
      return staticString(expression)?.trim() ?? null;
    }
    return null;
  }
  return null;
}

function jsxName(node) {
  if (node.type === 'JSXIdentifier') return { name: node.name };
  if (node.type === 'JSXMemberExpression' && node.object.type === 'JSXIdentifier') {
    return { namespace: node.object.name, name: node.property.name };
  }
  return null;
}

function isGlobalReference(context, node) {
  const sourceCode = context.sourceCode ?? context.getSourceCode();
  let scope = sourceCode.getScope ? sourceCode.getScope(node) : context.getScope();
  while (scope) {
    const variable = scope.set.get(node.name);
    if (variable) return variable.defs.length === 0;
    scope = scope.upper;
  }
  return true;
}

const useSharedGuardAndConfirm = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Dev tools and in-page editors use the shared unsaved-work guard and ConfirmDialog, not per-tool unload handlers, native confirms, or hand-built confirmation dialogs',
      category: 'Best Practices',
    },
    messages: {
      beforeUnload:
        'Do not add a tool-local beforeunload handler. Report the work with useUnsavedWork (inside /dev) or useDirtyGuard (in-page editors); the shared guard owns unload.',
      nativeConfirm:
        'Do not use the native confirm(). Ask with useConfirm() or <ConfirmDialog> from @/features/dev/components.',
      alertDialog:
        'Do not build confirmations from the AlertDialog primitive. Ask with useConfirm() or <ConfirmDialog>; guard unsaved work with useUnsavedWork or useDirtyGuard.',
      confirmDialog:
        'This Dialog asks a question ("{{title}}"): a hand-built confirmation. Use useConfirm() or <ConfirmDialog>, or useUnsavedWork / useDirtyGuard for unsaved work.',
    },
    schema: [],
  },
  create(context) {
    const titleNames = new Set();
    const dialogNamespaces = new Set();

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (ALERT_DIALOG_SOURCES.has(source)) {
          context.report({ node, messageId: 'alertDialog' });
          return;
        }
        if (!DIALOG_SOURCES.has(source)) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') dialogNamespaces.add(specifier.local.name);
          else if (specifier.type === 'ImportSpecifier' && TITLE_EXPORTS.has(specifier.imported.name)) {
            titleNames.add(specifier.local.name);
          }
        }
      },

      JSXElement(node) {
        const name = jsxName(node.openingElement.name);
        if (!name) return;
        const isTitle = name.namespace
          ? dialogNamespaces.has(name.namespace) && TITLE_EXPORTS.has(name.name)
          : titleNames.has(name.name);
        if (!isTitle) return;
        const text = trailingText(node);
        if (text && text.endsWith('?')) {
          const sourceCode = context.sourceCode ?? context.getSourceCode();
          const title = node.children.map((child) => sourceCode.getText(child)).join('').trim();
          context.report({ node, messageId: 'confirmDialog', data: { title: title.slice(0, 60) } });
        }
      },

      CallExpression(node) {
        const callee = node.callee;
        if (callee.type === 'MemberExpression') {
          const method = staticPropertyName(callee);
          if (method === 'addEventListener' && staticString(node.arguments[0]) === 'beforeunload') {
            context.report({ node, messageId: 'beforeUnload' });
            return;
          }
          if (
            method === 'confirm' &&
            callee.object.type === 'Identifier' &&
            WINDOW_OBJECTS.has(callee.object.name) &&
            isGlobalReference(context, callee.object)
          ) {
            context.report({ node, messageId: 'nativeConfirm' });
          }
          return;
        }
        if (callee.type === 'Identifier' && callee.name === 'confirm' && isGlobalReference(context, callee)) {
          context.report({ node, messageId: 'nativeConfirm' });
        }
      },

      AssignmentExpression(node) {
        if (node.left.type === 'MemberExpression' && staticPropertyName(node.left) === 'onbeforeunload') {
          context.report({ node, messageId: 'beforeUnload' });
        }
      },
    };
  },
};

module.exports = {
  meta: {
    name: 'eslint-plugin-editor-guardrails',
    version: '1.0.0',
  },
  rules: {
    'use-shared-guard-and-confirm': useSharedGuardAndConfirm,
  },
};
