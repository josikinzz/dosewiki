import { flattenVCodeHeadingText } from "./headings";
import type { VCodeNode } from "./types";

/**
 * Effect Index authors the effect roundups inside its intensity-scale articles
 * as `[panel]` blocks holding nothing but lists of links to effect pages, each
 * optionally qualified by a frequency in `[sup]`. Rendered literally that is a
 * wall of underlined prose links; rendered as rows it is the same index panel
 * the Effect and Substance indexes already use.
 *
 * This module recognises that shape and nothing else. Any panel carrying real
 * prose, an image, or a list item that is not simply "one link, one optional
 * qualifier" fails the match and falls back to generic rendering — a partially
 * converted panel would silently drop whatever did not fit.
 */

interface VCodePanelRow {
  label: string;
  /** Destination exactly as authored; the renderer resolves it. */
  href: string;
  /** Trailing qualifier, e.g. "(common)". */
  meta?: string;
  /**
   * Sub-effects of this one — "Vomiting" under "Nausea" — authored as a list
   * nested after the row it qualifies. One level deep across the corpus, and
   * one level is all this carries.
   */
  children?: VCodePanelRow[];
}

export interface VCodePanelSection {
  title?: string;
  titleHref?: string;
  rows: VCodePanelRow[];
}

/**
 * Only internal links. An outbound link needs the rel/target treatment
 * `ExtLink` gives it, which a bare index row has no slot for, so a panel
 * containing one falls back to generic rendering rather than losing it.
 */
const LINK_NODE_NAMES = new Set(["int-link"]);
const HEADING_NODE_NAMES = new Set(["h1", "h2", "h3", "h4"]);
/** Inline emphasis around a link carries no content of its own. */
const TRANSPARENT_NODE_NAMES = new Set(["b", "i", "u", "s", "p"]);

interface InlineParts {
  links: VCodeNode[];
  qualifiers: VCodeNode[];
  /** Any text or node that is neither the link nor its qualifier. */
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

/** A section heading that is itself a single link opens a linked section. */
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

/**
 * Walk a panel's content into sections and rows. `insideList` distinguishes the
 * two jobs a list node does: the outer one opens the rows, an inner one
 * qualifies the row it follows.
 *
 * Returns false the moment it meets something it would have to drop.
 */
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
      // A heading found inside a list is the DMT article's missing `[/ul]`, not
      // a sub-heading. Either way it opens the next section.
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

      // A sub-list that opened a section of its own, nested deeper still, or
      // came out empty is past what a single indent level can say.
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

/**
 * The sections a `[panel]` reduces to, or `null` when it holds anything this
 * shape cannot carry losslessly. An unsectioned panel yields a single untitled
 * section, so callers render one code path either way.
 */
export function extractVCodePanelSections(
  children: (string | VCodeNode)[] | undefined,
): VCodePanelSection[] | null {
  const state: Extraction = { sections: [], current: null };

  if (!consume(children, state, false)) {
    return null;
  }

  // A heading with no list under it means the panel says something this shape
  // would drop, so the whole panel falls back rather than losing it.
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
