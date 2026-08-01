import { slugify } from "@/utils/slug";
import { normalizeVCodeContent } from "./normalize";
import type { VCodeContent, VCodeNode } from "./types";

const HEADING_TAG_LEVELS: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4 };

/**
 * Titled blocks are headings too: they open a labelled part of the article even
 * though they render as card chrome rather than as an `<h*>`. Both rank below
 * every real heading, because a body that has headings uses these blocks inside
 * them — but where they are all an article has, they are its outline, as in the
 * intensity scales' stack of level cards. A `panel` groups content inside a
 * `headered-textbox`, so it ranks below that in turn.
 */
const HEADERED_TEXTBOX_LEVEL = 5;
const PANEL_LEVEL = 6;
const MARKDOWN_HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const MARKDOWN_BULLET_PATTERN = /^[-*]\s+/;

export interface VCodeHeading {
  id: string;
  level: number;
  text: string;
}

/**
 * Assigns anchor ids in document order, because an article may repeat a
 * heading title. The renderer and the table of contents both walk the same
 * normalized content, so both land on the same suffix for a repeated title —
 * they must never derive an id independently of this order.
 *
 * `reservedIds` marks ids that already exist on the page outside the body —
 * section wrappers like `#overview` — so a body heading whose title slugs to
 * one of them takes a suffix instead of duplicating the DOM id.
 */
export function createVCodeHeadingIdAssigner(
  reservedIds?: Iterable<string>,
): (text: string) => string | undefined {
  const used = new Map<string, number>();

  if (reservedIds) {
    for (const id of reservedIds) {
      used.set(id, (used.get(id) ?? 0) + 1);
    }
  }

  return (text) => {
    const base = slugify(text);

    if (!base) {
      return undefined;
    }

    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);

    return seen === 0 ? base : `${base}-${seen + 1}`;
  };
}

/** A headered-textbox is titled by its label and header together, as it renders. */
export function formatHeaderedTextboxTitle(label?: string, header?: string): string {
  return [label, header].filter(Boolean).join(" · ");
}

/** Plain text of a heading's children, so a heading wrapping links still slugs. */
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

/**
 * Markdown heading lines inside a `markdown` node, following the same block
 * splitting the renderer applies: blank lines separate blocks, and a block of
 * nothing but bullets becomes a list rather than prose.
 */
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

/**
 * Every heading a VCode body renders, in document order, with the anchor id
 * `VCodeRenderer` emits for it. Raw string bodies are parsed first, so an
 * article that only carries `body_raw` still yields its headings.
 */
export function extractVCodeHeadings(content: VCodeContent | undefined): VCodeHeading[] {
  if (content == null) {
    return [];
  }

  const normalized = normalizeVCodeContent(content, undefined) ?? content;
  const assignId = createVCodeHeadingIdAssigner();
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

    // Titled blocks render their title before their body, and the assigner is
    // order-dependent, so visit the title first here too.
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
