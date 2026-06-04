import type { VCodeContent, VCodeNode } from "./types";

const RAW_VCODE_TAG_PATTERN = /\[(\/?)([a-z][\w-]*)([^\]]*)\]/gi;
const VOID_VCODE_TAGS = new Set(["br", "hr", "ref", "toc"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isVCodeNode(value: unknown): value is VCodeNode {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.name === "string" &&
    isRecord(value.properties) &&
    Array.isArray(value.children) &&
    value.children.every((child) => typeof child === "string" || isVCodeNode(child))
  );
}

export function normalizeVCodeContent(ast: unknown, raw: string | undefined): VCodeContent | undefined {
  if (typeof ast === "string" && ast.trim().length > 0) {
    return parseRawVCodeContent(ast);
  }

  if (isVCodeNode(ast)) {
    return ast;
  }

  if (Array.isArray(ast) && ast.every((node) => typeof node === "string" || isVCodeNode(node))) {
    return ast;
  }

  return raw && raw.trim().length > 0 ? parseRawVCodeContent(raw) : undefined;
}

function parseVCodeProperties(input: string): Record<string, string> {
  const properties: Record<string, string> = {};
  const attributePattern = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/]+))/g;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(input)) !== null) {
    const [, key, doubleQuotedValue, singleQuotedValue, bareValue] = match;
    properties[key] = doubleQuotedValue ?? singleQuotedValue ?? bareValue ?? "";
  }

  return properties;
}

export function parseRawVCodeContent(raw: string): VCodeContent {
  RAW_VCODE_TAG_PATTERN.lastIndex = 0;

  if (!RAW_VCODE_TAG_PATTERN.test(raw)) {
    return raw;
  }

  RAW_VCODE_TAG_PATTERN.lastIndex = 0;

  const root: { children: (string | VCodeNode)[] } = { children: [] };
  const stack: Array<{ name: string; children: (string | VCodeNode)[] }> = [
    { name: "__root__", children: root.children },
  ];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = RAW_VCODE_TAG_PATTERN.exec(raw)) !== null) {
    const [fullMatch, closingSlash, rawName, rawAttributes] = match;
    const textBeforeTag = raw.slice(cursor, match.index);

    if (textBeforeTag) {
      stack[stack.length - 1].children.push(textBeforeTag);
    }

    cursor = match.index + fullMatch.length;

    const name = rawName.toLowerCase();

    if (closingSlash) {
      let openIndex = -1;
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index].name === name) {
          openIndex = index;
          break;
        }
      }
      if (openIndex > 0) {
        stack.length = openIndex;
      }
      continue;
    }

    const selfClosing = rawAttributes.trim().endsWith("/") || VOID_VCODE_TAGS.has(name);
    const node: VCodeNode = {
      name,
      properties: parseVCodeProperties(rawAttributes),
      children: [],
    };

    stack[stack.length - 1].children.push(node);

    if (!selfClosing) {
      stack.push(node);
    }
  }

  const remainingText = raw.slice(cursor);
  if (remainingText) {
    stack[stack.length - 1].children.push(remainingText);
  }

  return root.children.length === 1 ? root.children[0] : root.children;
}
