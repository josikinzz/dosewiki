export const keepCommentPatterns = {
  "eslint-directive": /^\s*eslint-(?:disable|enable)(?:-next-line|-line)?(?:\s|$)/,
  "vitest-environment": /^\s*@vitest-environment(?:-options)?\b/,
  "bundler-magic": /^\s*(?:webpack|turbopack)[A-Z]\w*\s*:/,
  "pure-annotation": /^\s*[#@]__(?:PURE|NO_SIDE_EFFECTS)__\s*$/,
  "vite-magic": /^\s*@vite-ignore\b/,
  "license": /(?:^!|@license\b|@preserve\b|SPDX-License-Identifier:)/,
};

export function commentKind(comment) {
  if (comment.type === "Shebang") return "shebang";
  return Object.entries(keepCommentPatterns).find(([, pattern]) => pattern.test(comment.value))?.[0];
}

function removal(sourceCode, range, jsx) {
  const text = sourceCode.text;
  let [start, end] = range;
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const nextLine = text.indexOf("\n", end);
  const lineEnd = nextLine === -1 ? text.length : nextLine;
  const prefix = text.slice(lineStart, start);
  const suffix = text.slice(end, lineEnd);
  let replacement = jsx ? "" : /[\r\n\u2028\u2029]/.test(text.slice(start, end)) ? "\n" : " ";
  if (/^[\t ]*$/.test(prefix) && /^[\t \r]*$/.test(suffix)) {
    start = lineStart;
    end = nextLine === -1 ? lineEnd : nextLine + 1;
    replacement = "";
    const before = text.slice(0, start).match(/(?:[\t ]*\r?\n)+$/)?.[0] ?? "";
    const after = text.slice(end).match(/^(?:[\t ]*\r?\n)+/)?.[0] ?? "";
    start -= before.length;
    end += after.length;
    replacement = start === 0 ? "" : (before.split("\n").length > 2 || after ? "\n\n" : "\n");
    if (end === text.length && start > 0) replacement = "\n";
  } else if (/^[\t \r]*$/.test(suffix)) {
    start -= prefix.match(/[\t ]*$/)[0].length;
    replacement = text.slice(start, end).includes("\n") ? "\n" : "";
  }
  return { range: [start, end], replacement };
}

const noComments = {
  meta: {
    type: "suggestion",
    fixable: "code",
    schema: [],
    messages: { comment: "Remove this comment. Only machine directives and license headers are allowed." },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const containers = new Map();
    return {
      JSXExpressionContainer(node) {
        if (node.expression.type !== "JSXEmptyExpression") return;
        const comments = sourceCode.getCommentsInside(node);
        if (comments.some(commentKind)) return;
        for (const comment of comments) containers.set(comment.range[0], node.range);
      },
      "Program:exit"() {
        for (const comment of sourceCode.getAllComments()) {
          if (commentKind(comment)) continue;
          context.report({
            loc: comment.loc,
            messageId: "comment",
            fix(fixer) {
              const container = containers.get(comment.range[0]);
              const edit = removal(sourceCode, container ?? comment.range, Boolean(container));
              return fixer.replaceTextRange(edit.range, edit.replacement);
            },
          });
        }
      },
    };
  },
};

export default { rules: { "no-comments": noComments } };
