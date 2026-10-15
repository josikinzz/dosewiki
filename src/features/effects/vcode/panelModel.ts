import { flattenVCodeHeadingText } from "./headings";
import type { VCodeNode } from "./types";

interface VCodePanelRow {
  label: string;
  href: string;
  meta?: string;
  children?: VCodePanelRow[];
}

export interface VCodePanelSection {
  title?: string;
  titleHref?: string;
  rows: VCodePanelRow[];
}

const LINK_NODE_NAMES = new Set(["int-link"]);
const HEADING_NODE_NAMES = new Set(["h1", "h2", "h3", "h4"]);
const TRANSPARENT_NODE_NAMES = new Set(["b", "i", "u", "s", "p"]);

interface InlineParts {
  links: VCodeNode[];
  qualifiers: VCodeNode[];
  hasResidue: boolean;
}

function isBlank(value: string) {
  return value.trim().length === 0;
}

function collectInlineParts(
  children: (string | VCodeNode)[] | undefined,
  parts: InlineParts,
): void {
  for (const child of children ?? []) {
    if (child == null) {
      continue;
    }

    if (typeof child === "string") {
      if (!isBlank(child)) {
        parts.hasResidue = true;
      }
      continue;
    }

    if (LINK_NODE_NAMES.has(child.name)) {
      parts.links.push(child);
      continue;
    }

    if (child.name === "sup") {
      parts.qualifiers.push(child);
      continue;
    }

    if (TRANSPARENT_NODE_NAMES.has(child.name)) {
      collectInlineParts(child.children, parts);
      continue;
    }

    if (child.name === "markdown") {
      if (!isBlank(child.properties?.text ?? "")) {
        parts.hasResidue = true;
      }
      continue;
    }

    if (child.name === "br") {
      continue;
    }

    parts.hasResidue = true;
  }
}

function readInlineParts(children: (string | VCodeNode)[] | undefined): InlineParts {
  const parts: InlineParts = { links: [], qualifiers: [], hasResidue: false };
  collectInlineParts(children, parts);
  return parts;
}

function toRow(item: VCodeNode): VCodePanelRow | null {
  const parts = readInlineParts(item.children);

  if (parts.hasResidue || parts.links.length !== 1 || parts.qualifiers.length > 1) {
    return null;
  }

  const [link] = parts.links;
  const label = flattenVCodeHeadingText(link.children).trim();
  const href = link.properties?.to?.trim();

  if (!label || !href) {
    return null;
  }

  const meta = parts.qualifiers[0]
    ? flattenVCodeHeadingText(parts.qualifiers[0].children).trim()
    : "";

  return { label, href, ...(meta ? { meta } : {}) };
}

function readHeadingHref(node: VCodeNode): string | null {
  const parts = readInlineParts(node.children);

  if (parts.hasResidue || parts.qualifiers.length > 0 || parts.links.length !== 1) {
    return null;
  }

  return parts.links[0].properties?.to?.trim() || null;
}

const LIST_NODE_NAMES = new Set(["ul", "ol"]);

interface Extraction {
  sections: VCodePanelSection[];
  current: VCodePanelSection | null;
}

function openSection(state: Extraction, section: VCodePanelSection) {
  state.sections.push(section);
  state.current = section;
}

function currentSection(state: Extraction): VCodePanelSection {
  if (!state.current) {
    openSection(state, { rows: [] });
  }

  return state.current as VCodePanelSection;
}

function consume(
  children: (string | VCodeNode)[] | undefined,
  state: Extraction,
  insideList: boolean,
): boolean {
  for (const child of children ?? []) {
    if (child == null) {
      continue;
    }

    if (typeof child === "string") {
      if (!isBlank(child)) {
        return false;
      }
      continue;
    }

    if (child.name === "markdown") {
      if (!isBlank(child.properties?.text ?? "")) {
        return false;
      }
      continue;
    }

    if (HEADING_NODE_NAMES.has(child.name)) {
      const title = flattenVCodeHeadingText(child.children).trim();

      if (!title) {
        return false;
      }

      const titleHref = readHeadingHref(child);
      openSection(state, { title, ...(titleHref ? { titleHref } : {}), rows: [] });
      continue;
    }

    if (LIST_NODE_NAMES.has(child.name)) {
      if (!insideList) {
        if (!consume(child.children, state, true)) {
          return false;
        }
        continue;
      }

      const openRows = currentSection(state).rows;
      const parent = openRows[openRows.length - 1];

      if (!parent || parent.children) {
        return false;
      }

      const nested: Extraction = { sections: [], current: null };

      if (!consume(child.children, nested, true)) {
        return false;
      }

      if (nested.sections.length !== 1 || nested.sections[0].rows.length === 0) {
        return false;
      }

      if (nested.sections[0].rows.some((row) => row.children)) {
        return false;
      }

      parent.children = nested.sections[0].rows;
      continue;
    }

    if (child.name === "li") {
      const row = toRow(child);

      if (!row) {
        return false;
      }

      currentSection(state).rows.push(row);
      continue;
    }

    return false;
  }

  return true;
}

export function extractVCodePanelSections(
  children: (string | VCodeNode)[] | undefined,
): VCodePanelSection[] | null {
  const state: Extraction = { sections: [], current: null };

  if (!consume(children, state, false)) {
    return null;
  }

  if (state.sections.length === 0 || state.sections.some((section) => section.rows.length === 0)) {
    return null;
  }

  return state.sections;
}

function countRows(rows: VCodePanelRow[]): number {
  return rows.reduce((total, row) => total + 1 + countRows(row.children ?? []), 0);
}

export function countVCodePanelRows(sections: VCodePanelSection[]): number {
  return sections.reduce((total, section) => total + countRows(section.rows), 0);
}
