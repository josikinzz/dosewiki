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
  headingIds?: boolean;
  assignHeadingId?: (text: string) => string | undefined;
  headeredTextboxPresentation?: HeaderedTextboxPresentation;
  headeredTextboxHeadingLevel?: 2 | 3;
  artistCreditLinks?: ArtistCreditLinks;
  renderArtistCredit?: (artist: string) => ReactNode;
  mediaVariantKey?: string;
}

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
  const assignHeadingId =
    sharedAssignHeadingId ?? (headingIds ? createVCodeHeadingIdAssigner() : undefined);

  const renderNode = (node: string | VCodeNode, index: number): ReactNode => {
    if (node == null) {
      return null;
    }

    if (typeof node === "string") {
      if (node === "\n" || node === "\n\n") {
        return <Fragment key={index}>{node}</Fragment>;
      }
      return <Fragment key={index}>{node}</Fragment>;
    }

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

  if (typeof normalizedContent === "string") {
    return <div className="type-supporting-copy theme-text-secondary">{normalizedContent}</div>;
  }

  if (Array.isArray(normalizedContent)) {
    return (
      <div className="theme-text-secondary space-y-5">
        {normalizedContent.map((node, index) => renderNode(node, index))}
      </div>
    );
  }

  return (
    <div className="theme-text-secondary">
      {renderNode(normalizedContent, 0)}
    </div>
  );
}
