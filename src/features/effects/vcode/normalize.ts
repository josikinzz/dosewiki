import type { VCodeContent, VCodeNode } from "./types";

const RAW_VCODE_TAG_PATTERN = /\[(\/?)([a-z][\w-]*)([^\]]*)\]/gi;
const VOID_VCODE_TAGS = new Set(["br", "hr", "ref", "toc"]);

// Mirrors the `vcodeRenderers` registry keys; normalize.test.ts fails on drift.
export const VCODE_TAG_NAMES = new Set([
  "audio-player",
  "b",
  "br",
  "captioned-image",
  "column",
  "columns",
  "ext-link",
  "h1",
  "h2",
  "h3",
  "h4",
  "headered-textbox",
  "hr",
  "i",
  "int-link",
  "li",
  "markdown",
  "ol",
  "p",
  "panel",
  "quote",
  "ref",
  "s",
  "separated-textbox",
  "subarticle",
  "sup",
  "toc",
  "u",
  "ul",
  "youtube-embed",
]);

export const HASH_DIRECTIVE_ALIASES: Record<string, string> = {
  "cap-img": "captioned-image",
  md: "markdown",
  quotation: "quote",
};

const HASH_BLOCK_TAG_NAMES = new Set([
  "audio-player",
  "captioned-image",
  "columns",
  "h1",
  "h2",
  "h3",
  "h4",
  "headered-textbox",
  "hr",
  "markdown",
  "ol",
  "p",
  "panel",
  "quote",
  "separated-textbox",
  "subarticle",
  "toc",
  "ul",
  "youtube-embed",
]);

// Hash-dialect containers hold multi-paragraph prose, so their bodies get the
// same blank-line paragraph grouping as top-level content.
const HASH_CONTAINER_TAG_NAMES = new Set([
  "column",
  "columns",
  "headered-textbox",
  "panel",
  "quote",
  "separated-textbox",
  "subarticle",
]);

const HASH_DIRECTIVE_NAME_PATTERN = /^[A-Za-z][\w-]*/;
export const HASH_ATTRIBUTE_PATTERN = /^\|([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^|{\s]*))/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVCodeNode(value: unknown): value is VCodeNode {
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
    return applyHashDialectToNode(ast);
  }

  if (Array.isArray(ast) && ast.every((node) => typeof node === "string" || isVCodeNode(node))) {
    return applyHashDialect(ast, true);
  }

  return raw && raw.trim().length > 0 ? parseRawVCodeContent(raw) : undefined;
}

/**
 * Unwrap top-level quote nodes into their prose, regrouping loose text into
 * paragraphs. Personal commentary renders inside a speech-bubble surface that
 * already supplies the quote chrome and attribution, so a nested blockquote
 * card would double the framing. Quotes nested deeper in the content keep
 * their normal chrome.
 */
export function unwrapTopLevelQuotes(content: (string | VCodeNode)[]): (string | VCodeNode)[];
export function unwrapTopLevelQuotes(content: VCodeContent): VCodeContent;
export function unwrapTopLevelQuotes(content: VCodeContent): VCodeContent {
  if (typeof content === "string") {
    return content;
  }

  const nodes = Array.isArray(content) ? content : [content];
  return nodes.flatMap((node) =>
    typeof node !== "string" && node.name === "quote"
      ? groupHashContent(node.children)
      : [node],
  );
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

function pushVCodeText(children: (string | VCodeNode)[], text: string) {
  if (!text) {
    return;
  }

  const lastIndex = children.length - 1;
  const last = children[lastIndex];

  if (typeof last === "string") {
    children[lastIndex] = last + text;
    return;
  }

  children.push(text);
}

function hasBracketClosingTag(raw: string, name: string, fromIndex: number) {
  return new RegExp(`\\[/${name}\\s*\\]`, "i").test(raw.slice(fromIndex));
}

// Prose such as `[Alan Watts]` or `[Monism](url)` must stay literal text instead
// of opening a node that swallows every following sibling.
function isBracketTagOpening(
  raw: string,
  name: string,
  rawAttributes: string,
  afterTagIndex: number,
) {
  if (VCODE_TAG_NAMES.has(name) || VOID_VCODE_TAGS.has(name)) {
    return true;
  }

  return (
    rawAttributes.trim().endsWith("/") || hasBracketClosingTag(raw, name, afterTagIndex)
  );
}

function parseBracketVCodeContent(raw: string): (string | VCodeNode)[] {
  RAW_VCODE_TAG_PATTERN.lastIndex = 0;

  if (!RAW_VCODE_TAG_PATTERN.test(raw)) {
    return [raw];
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

    pushVCodeText(stack[stack.length - 1].children, textBeforeTag);

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
      } else if (!VCODE_TAG_NAMES.has(name)) {
        pushVCodeText(stack[stack.length - 1].children, fullMatch);
      }
      continue;
    }

    if (!isBracketTagOpening(raw, name, rawAttributes, cursor)) {
      pushVCodeText(stack[stack.length - 1].children, fullMatch);
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

  pushVCodeText(stack[stack.length - 1].children, raw.slice(cursor));

  return root.children;
}

export function parseRawVCodeContent(raw: string): VCodeContent {
  const content = applyHashDialect(parseBracketVCodeContent(raw), true);

  return content.length === 1 ? content[0] : content;
}

function readBracedBody(raw: string, openIndex: number) {
  let depth = 0;

  for (let index = openIndex; index < raw.length; index += 1) {
    const character = raw[index];

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return { body: raw.slice(openIndex + 1, index), end: index + 1 };
      }
    }
  }

  return null;
}

function flattenVCodeText(children: (string | VCodeNode)[]): string {
  return children
    .map((child) => {
      if (typeof child === "string") {
        return child;
      }

      return child.name === "markdown"
        ? child.properties.text ?? ""
        : flattenVCodeText(child.children);
    })
    .join("");
}

function parseHashChildren(body: string): (string | VCodeNode)[] {
  return parseHashDirectives(body) ?? (body ? [body] : []);
}

function readHashDirective(raw: string, start: number) {
  const nameMatch = HASH_DIRECTIVE_NAME_PATTERN.exec(raw.slice(start + 2));

  if (!nameMatch) {
    return null;
  }

  let cursor = start + 2 + nameMatch[0].length;
  const properties: Record<string, string> = {};

  while (raw[cursor] === "|") {
    const attributeMatch = HASH_ATTRIBUTE_PATTERN.exec(raw.slice(cursor));

    if (!attributeMatch) {
      break;
    }

    const [matched, key, doubleQuotedValue, singleQuotedValue, bareValue] = attributeMatch;
    properties[key] = doubleQuotedValue ?? singleQuotedValue ?? bareValue ?? "";
    cursor += matched.length;
  }

  let children: (string | VCodeNode)[] = [];
  let closed = true;

  if (raw[cursor] === "{") {
    const body = readBracedBody(raw, cursor);

    if (body) {
      children = parseHashChildren(body.body);
      cursor = body.end;
    } else {
      children = parseHashChildren(raw.slice(cursor + 1));
      cursor = raw.length;
      closed = false;
    }
  }

  const name = HASH_DIRECTIVE_ALIASES[nameMatch[0].toLowerCase()] ?? nameMatch[0].toLowerCase();

  // Unclosed and unknown directives degrade to their inner text so readers never
  // meet a half-parsed directive.
  if (!closed || !VCODE_TAG_NAMES.has(name)) {
    return { content: children, end: cursor };
  }

  if (name === "markdown") {
    return {
      content: [
        {
          name,
          properties: { ...properties, text: properties.text ?? flattenVCodeText(children) },
          children: [],
        },
      ],
      end: cursor,
    };
  }

  return {
    content: [
      {
        name,
        properties,
        children: HASH_CONTAINER_TAG_NAMES.has(name) ? groupHashContent(children) : children,
      },
    ],
    end: cursor,
  };
}

function parseHashDirectives(raw: string): (string | VCodeNode)[] | null {
  if (!raw.includes("##")) {
    return null;
  }

  const content: (string | VCodeNode)[] = [];
  let pendingText = "";
  let cursor = 0;
  let foundDirective = false;

  const flushText = () => {
    pushVCodeText(content, pendingText);
    pendingText = "";
  };

  while (cursor < raw.length) {
    const start = raw.indexOf("##", cursor);

    if (start === -1) {
      pendingText += raw.slice(cursor);
      break;
    }

    const directive = readHashDirective(raw, start);

    if (!directive) {
      pendingText += raw.slice(cursor, start + 2);
      cursor = start + 2;
      continue;
    }

    pendingText += raw.slice(cursor, start);
    flushText();
    content.push(...directive.content);
    cursor = directive.end;
    foundDirective = true;
  }

  flushText();

  return foundDirective ? content : null;
}

function trimInlineRun(run: (string | VCodeNode)[]): (string | VCodeNode)[] {
  const trimmed = [...run];

  while (trimmed.length > 0 && typeof trimmed[0] === "string" && !trimmed[0].trim()) {
    trimmed.shift();
  }

  while (
    trimmed.length > 0 &&
    typeof trimmed[trimmed.length - 1] === "string" &&
    !(trimmed[trimmed.length - 1] as string).trim()
  ) {
    trimmed.pop();
  }

  if (trimmed.length === 0) {
    return trimmed;
  }

  const first = trimmed[0];
  if (typeof first === "string") {
    trimmed[0] = first.replace(/^\s+/, "");
  }

  const lastIndex = trimmed.length - 1;
  const last = trimmed[lastIndex];
  if (typeof last === "string") {
    trimmed[lastIndex] = last.replace(/\s+$/, "");
  }

  return trimmed;
}

// Hash-dialect source is a flat run of prose and directives; blank lines are its
// only paragraph signal, so rebuild the same shape the bracket dialect stores.
function groupHashContent(content: (string | VCodeNode)[]): (string | VCodeNode)[] {
  const grouped: (string | VCodeNode)[] = [];
  let inlineRun: (string | VCodeNode)[] = [];

  const flushInlineRun = () => {
    const children = trimInlineRun(inlineRun);
    inlineRun = [];

    if (children.length > 0) {
      grouped.push({ name: "p", properties: {}, children });
    }
  };

  for (const item of content) {
    if (typeof item !== "string") {
      if (HASH_BLOCK_TAG_NAMES.has(item.name)) {
        flushInlineRun();
        grouped.push(item);
      } else {
        inlineRun.push(item);
      }
      continue;
    }

    item.split(/\n{2,}/).forEach((segment, index) => {
      if (index > 0) {
        flushInlineRun();
      }
      if (segment) {
        inlineRun.push(segment);
      }
    });
  }

  flushInlineRun();

  return grouped;
}

function applyHashDialect(
  children: (string | VCodeNode)[],
  group: boolean,
): (string | VCodeNode)[] {
  const content: (string | VCodeNode)[] = [];

  for (const child of children) {
    if (typeof child !== "string") {
      content.push(applyHashDialectToNode(child));
      continue;
    }

    const parsed = parseHashDirectives(child);

    if (!parsed) {
      content.push(child);
      continue;
    }

    content.push(...(group ? groupHashContent(parsed) : parsed));
  }

  return content;
}

function applyHashDialectToNode(node: VCodeNode): VCodeNode {
  return { ...node, children: applyHashDialect(node.children, false) };
}
