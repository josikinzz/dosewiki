import { Fragment, ReactNode } from "react";
import type { VCodeNode, VCodeContent } from "./types";
import { vcodeRenderers } from "./renderers";
import { normalizeVCodeContent } from "./normalize";
import { createVCodeHeadingIdAssigner } from "./headings";
import type { HeaderedTextboxPresentation } from "./components/HeaderedTextbox";
import type { ArtistCreditLinks } from "./artistCreditLinks";

interface VCodeRendererProps {
  content: VCodeContent;
  citations?: Array<{ url: string; text: string; from?: string }>;
  subarticles?: Array<{ id: string; title: string }>;
  /**
   * Emit anchor ids on headings, matching `extractVCodeHeadings`. Opt-in: only
   * pages that link to their own headings want them, and a body heading whose
   * title matches a page section id would otherwise duplicate that id.
   */
  headingIds?: boolean;
  /**
   * Shared id assigner for pages that render one article through several
   * renderer instances (one per section). Each instance would otherwise start
   * its own duplicate counter, so two sections with the same subheading title
   * would collide. Implies `headingIds`.
   */
  assignHeadingId?: (text: string) => string | undefined;
  /** Opt-in narrative treatment; effect/substance callers retain cards. */
  headeredTextboxPresentation?: HeaderedTextboxPresentation;
  headeredTextboxHeadingLevel?: 2 | 3;
  /**
   * Credit-line destinations for replication images embedded in the body.
   * Omitted where the surface does not load the gallery corpus, which leaves
   * every byline as plain text.
   */
  artistCreditLinks?: ArtistCreditLinks;
  /** Server-composed credit slot, so byline lookup never blocks the prose. */
  renderArtistCredit?: (artist: string) => ReactNode;
  /**
   * The drug class this surface speaks for; selects a per-class `imageRoutes`
   * variant on embeds that carry one.
   */
  mediaVariantKey?: string;
}

/**
 * Main VCode renderer component.
 * 
 * Renders EffectIndex VCode AST content as React components.
 * Supports both raw strings (passed through) and parsed AST arrays.
 */
export function VCodeRenderer({
  content,
  citations = [],
  subarticles = [],
  headingIds = false,
  assignHeadingId: sharedAssignHeadingId,
  headeredTextboxPresentation = "card",
  headeredTextboxHeadingLevel = 3,
  artistCreditLinks,
  mediaVariantKey,
  renderArtistCredit,
}: VCodeRendererProps) {
  const normalizedContent = normalizeVCodeContent(content, undefined) ?? content;
  // Document-order state, so it must live for exactly one render pass.
  const assignHeadingId =
    sharedAssignHeadingId ?? (headingIds ? createVCodeHeadingIdAssigner() : undefined);

  const renderNode = (node: string | VCodeNode, index: number): ReactNode => {
    // Handle null/undefined nodes
    if (node == null) {
      return null;
    }

    // Handle string nodes (plain text)
    if (typeof node === "string") {
      // Preserve whitespace/newlines
      if (node === "\n" || node === "\n\n") {
        return <Fragment key={index}>{node}</Fragment>;
      }
      return <Fragment key={index}>{node}</Fragment>;
    }

    // Render children recursively with safety check
    const renderChildren = (children: (string | VCodeNode)[] | undefined): ReactNode => {
      if (!children || !Array.isArray(children)) {
        return null;
      }
      return children.map((child, i) => renderNode(child, i));
    };

    const renderer = vcodeRenderers[node.name];
    if (renderer) {
      return renderer(node, index, {
        citations,
        subarticles,
        renderChildren,
        renderNode,
        assignHeadingId,
        headeredTextboxPresentation,
        headeredTextboxHeadingLevel,
        artistCreditLinks,
        mediaVariantKey,
        renderArtistCredit,
      });
    }

    console.warn(`Unknown VCode tag: ${node.name}`);
    const children = renderChildren(node.children);
    if (!children) {
      return null;
    }

    return (
      <span key={index} className="theme-text-muted">
        {children}
      </span>
    );
  };

  // Handle different content types
  if (typeof normalizedContent === "string") {
    // Raw string content - just render as text
    return <div className="type-supporting-copy theme-text-secondary">{normalizedContent}</div>;
  }

  if (Array.isArray(normalizedContent)) {
    // Parsed AST array
    return (
      <div className="theme-text-secondary space-y-5">
        {normalizedContent.map((node, index) => renderNode(node, index))}
      </div>
    );
  }

  // Single node
  return (
    <div className="theme-text-secondary">
      {renderNode(normalizedContent, 0)}
    </div>
  );
}
