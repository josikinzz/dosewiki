import { slugify } from "@/utils/slug";
import { normalizeVCodeContent } from "./normalize";
import type { VCodeContent, VCodeNode } from "./types";

const HEADING_TAG_LEVELS: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4 };

const HEADERED_TEXTBOX_LEVEL = 5;
const PANEL_LEVEL = 6;
const MARKDOWN_HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const MARKDOWN_BULLET_PATTERN = /^[-*]\s+/;

export interface VCodeHeading {
  id: string;
  level: number;
  text: string;
}

export function createVCodeHeadingIdAssigner(
  reservedIds?: Iterable<string>,
): (text: string) => string | undefined {
  const used = new Set(reservedIds);
  const nextSuffix = new Map<string, number>();

  return (text) => {
    const base = slugify(text);

    if (!base) {
      return undefined;
    }

    let suffix = nextSuffix.get(base) ?? 1;
    let id = suffix === 1 ? base : `${base}-${suffix}`;
    while (used.has(id)) {
      suffix += 1;
      id = `${base}-${suffix}`;
    }
    used.add(id);
    nextSuffix.set(base, suffix + 1);
    return id;
  };
}

export function formatHeaderedTextboxTitle(label?: string, header?: string): string {
  return [label, header].filter(Boolean).join(" · ");
}

export function flattenVCodeHeadingText(children: (string | VCodeNode)[] | undefined): string {
  if (!children) {
    return "";
  }

  return children
    .map((child) => {
      if (typeof child === "string") {
        return child;
      }

      return child.name === "markdown"
        ? child.properties.text ?? ""
        : flattenVCodeHeadingText(child.children);
    })
    .join("");
}

function collectMarkdownHeadings(text: string, visit: (level: number, text: string) => void) {
  const normalizedText = text.trim();

  if (!normalizedText) {
    return;
  }

  for (const block of normalizedText.split(/\n{2,}/)) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0 || lines.every((line) => MARKDOWN_BULLET_PATTERN.test(line))) {
      continue;
    }

    for (const line of lines) {
      const match = MARKDOWN_HEADING_PATTERN.exec(line);

      if (match) {
        visit(Math.min(match[1].length, 4), match[2]);
      }
    }
  }
}

export function flattenMarkdownHeadingText(line: string): string {
  return line
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*|__|\*|_|~~/g, "")
    .trim();
}

const MARKDOWN_FENCE_PATTERN = /^(?:```|~~~)/;

export function extractMarkdownHeadings(
  markdown: string | undefined,
  assignId: (text: string) => string | undefined = createVCodeHeadingIdAssigner(),
): VCodeHeading[] {
  if (!markdown) {
    return [];
  }

  const headings: VCodeHeading[] = [];
  let inFence = false;

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();

    if (MARKDOWN_FENCE_PATTERN.test(line)) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      continue;
    }

    const match = MARKDOWN_HEADING_PATTERN.exec(line);

    if (!match) {
      continue;
    }

    const text = flattenMarkdownHeadingText(match[2]);
    const id = assignId(text);

    if (id) {
      headings.push({ id, level: match[1].length, text });
    }
  }

  return headings;
}

export function extractVCodeHeadings(
  content: VCodeContent | undefined,
  assignId: (text: string) => string | undefined = createVCodeHeadingIdAssigner(),
): VCodeHeading[] {
  if (content == null) {
    return [];
  }

  const normalized = normalizeVCodeContent(content, undefined) ?? content;
  const headings: VCodeHeading[] = [];

  const push = (level: number, text: string) => {
    const trimmed = text.trim();
    const id = assignId(trimmed);

    if (id) {
      headings.push({ id, level, text: trimmed });
    }
  };

  const visit = (node: string | VCodeNode) => {
    if (node == null || typeof node === "string") {
      return;
    }

    const level = HEADING_TAG_LEVELS[node.name];

    if (level) {
      push(level, flattenVCodeHeadingText(node.children));
      return;
    }

    if (node.name === "markdown") {
      collectMarkdownHeadings(node.properties.text ?? "", push);
      return;
    }

    if (node.name === "headered-textbox") {
      push(
        HEADERED_TEXTBOX_LEVEL,
        formatHeaderedTextboxTitle(node.properties.label, node.properties.header),
      );
    } else if (node.name === "panel") {
      push(PANEL_LEVEL, node.properties.title ?? "");
    }

    node.children?.forEach(visit);
  };

  if (typeof normalized === "string") {
    return [];
  }

  (Array.isArray(normalized) ? normalized : [normalized]).forEach(visit);

  return headings;
}
