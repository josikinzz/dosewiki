import { Fragment, ReactNode } from "react";
import type { VCodeNode, VCodeContent, NavigateHandler } from "./types";
import { vcodeRenderers } from "./renderers";

interface VCodeRendererProps {
  content: VCodeContent;
  onNavigate?: NavigateHandler;
  citations?: Array<{ url: string; text: string; from?: string }>;
  subarticles?: Array<{ id: string; title: string }>;
}

/**
 * Main VCode renderer component.
 * 
 * Renders EffectIndex VCode AST content as React components.
 * Supports both raw strings (passed through) and parsed AST arrays.
 */
export function VCodeRenderer({ 
  content, 
  onNavigate,
  citations = [],
  subarticles = [],
}: VCodeRendererProps) {
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
        onNavigate,
        renderChildren,
      });
    }

    console.warn(`Unknown VCode tag: ${node.name}`);
    const children = renderChildren(node.children);
    if (!children) {
      return null;
    }

    return (
      <span key={index} className="text-white/60">
        {children}
      </span>
    );
  };

  // Handle different content types
  if (typeof content === "string") {
    // Raw string content - just render as text
    return <div className="type-supporting-copy text-white/80">{content}</div>;
  }

  if (Array.isArray(content)) {
    // Parsed AST array
    return (
      <div className="space-y-5 text-white/80">
        {content.map((node, index) => renderNode(node, index))}
      </div>
    );
  }

  // Single node
  return (
    <div className="text-white/80">
      {renderNode(content, 0)}
    </div>
  );
}
