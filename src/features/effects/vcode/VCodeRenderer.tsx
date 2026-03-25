import { Fragment, ReactNode } from "react";
import type { VCodeNode, VCodeContent, NavigateHandler } from "./types";
import { HeaderedTextbox } from "./components/HeaderedTextbox";
import { SeparatedTextbox } from "./components/SeparatedTextbox";
import { CaptionedImage } from "./components/CaptionedImage";
import { Quote } from "./components/Quote";
import { Reference } from "./components/Reference";
import { IntLink } from "./components/IntLink";
import { ExtLink } from "./components/ExtLink";
import { Columns, Column } from "./components/Columns";
import { List, ListItem } from "./components/List";
import { SubarticleAnchor } from "./components/SubarticleAnchor";
import { TableOfContents } from "./components/TableOfContents";
import { Paragraph } from "./components/Paragraph";
import { Bold, Italic, Underline, Strikethrough } from "./components/TextFormatting";

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
  const renderMarkdownText = (text: string, index: number): ReactNode => {
    const normalizedText = text.trim();

    if (!normalizedText) {
      return null;
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(normalizedText);

    if (!headingMatch) {
      return <Paragraph key={index}>{normalizedText}</Paragraph>;
    }

    const [, headingHashes, headingText] = headingMatch;

    switch (headingHashes.length) {
      case 1:
        return (
          <h1 key={index} className="mt-10 mb-5 font-display text-[clamp(2rem,1.84rem+0.95vw,2.7rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-fuchsia-200 text-balance">
            {headingText}
          </h1>
        );
      case 2:
        return (
          <h2 key={index} className="mt-8 mb-3 font-display text-[clamp(1.45rem,1.32rem+0.55vw,1.85rem)] font-semibold leading-[1.08] tracking-[-0.025em] text-fuchsia-300 text-balance">
            {headingText}
          </h2>
        );
      case 3:
        return (
          <h3 key={index} className="mt-6 mb-2 text-[1.125rem] font-semibold leading-[1.24] tracking-[-0.01em] text-fuchsia-300/85 text-balance">
            {headingText}
          </h3>
        );
      default:
        return (
          <h4 key={index} className="mt-5 mb-2 text-base font-semibold leading-[1.35] text-fuchsia-300/70 text-balance">
            {headingText}
          </h4>
        );
    }
  };

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

    // Map VCode tag names to React components
    switch (node.name) {
      // Text formatting
      case "p":
        return (
          <Paragraph key={index}>
            {renderChildren(node.children)}
          </Paragraph>
        );

      case "b":
        return (
          <Bold key={index}>
            {renderChildren(node.children)}
          </Bold>
        );

      case "i":
        return (
          <Italic key={index}>
            {renderChildren(node.children)}
          </Italic>
        );

      case "u":
        return (
          <Underline key={index}>
            {renderChildren(node.children)}
          </Underline>
        );

      case "s":
        return (
          <Strikethrough key={index}>
            {renderChildren(node.children)}
          </Strikethrough>
        );

      // Content boxes
      case "headered-textbox":
        return (
          <HeaderedTextbox
            key={index}
            label={node.properties.label}
            header={node.properties.header}
            labelBackground={node.properties.labelBackground}
            headerBackground={node.properties.headerBackground}
          >
            {renderChildren(node.children)}
          </HeaderedTextbox>
        );

      case "separated-textbox":
        return (
          <SeparatedTextbox
            key={index}
            leftHeader={node.properties.leftHeader || node.properties.a}
            rightHeader={node.properties.rightHeader || node.properties.b}
          >
            {renderChildren(node.children)}
          </SeparatedTextbox>
        );

      case "panel":
        return (
          <div key={index} className="my-6 rounded-xl ring-1 ring-white/5 bg-white/5 p-4">
            {node.properties.title ? (
              <h3 className="mb-4 text-[1.125rem] font-semibold leading-[1.24] tracking-[-0.01em] text-fuchsia-300/85 text-balance">
                {node.properties.title}
              </h3>
            ) : null}
            <div className="space-y-4">{renderChildren(node.children)}</div>
          </div>
        );

      case "markdown":
        return renderMarkdownText(node.properties.text ?? "", index);

      // Media
      case "captioned-image":
        return (
          <CaptionedImage
            key={index}
            src={node.properties.src}
            width={node.properties.width}
            artist={node.properties.artist}
            title={node.properties.title}
            caption={node.properties.caption}
            align={node.properties.align as "left" | "right" | "center"}
            border={node.properties.border === "true"}
            top={node.properties.top === "true"}
          />
        );

      // Quotes
      case "quote":
        return (
          <Quote
            key={index}
            author={node.properties.author}
            source={node.properties.source}
          >
            {renderChildren(node.children)}
          </Quote>
        );

      // References
      case "ref":
        return (
          <Reference
            key={index}
            to={node.properties.to}
            citations={citations}
          />
        );

      // Links
      case "int-link":
        return (
          <IntLink
            key={index}
            to={node.properties.to}
            onNavigate={onNavigate}
          >
            {renderChildren(node.children)}
          </IntLink>
        );

      case "ext-link":
        return (
          <ExtLink
            key={index}
            to={node.properties.to}
          >
            {renderChildren(node.children)}
          </ExtLink>
        );

      // Layout
      case "columns":
        return (
          <Columns key={index}>
            {renderChildren(node.children)}
          </Columns>
        );

      case "column":
        return (
          <Column key={index}>
            {renderChildren(node.children)}
          </Column>
        );

      // Lists
      case "ul":
        return (
          <List key={index} ordered={false}>
            {renderChildren(node.children)}
          </List>
        );

      case "ol":
        return (
          <List key={index} ordered={true}>
            {renderChildren(node.children)}
          </List>
        );

      case "li":
        return (
          <ListItem key={index}>
            {renderChildren(node.children)}
          </ListItem>
        );

      // Subarticle anchors
      case "subarticle":
        return (
          <SubarticleAnchor
            key={index}
            id={node.properties.id}
            title={node.properties.title}
          >
            {renderChildren(node.children)}
          </SubarticleAnchor>
        );

      // Table of contents (self-closing)
      case "toc":
        return (
          <TableOfContents
            key={index}
            subarticles={subarticles}
          />
        );

      // Line break
      case "br":
        return <br key={index} />;

      // Horizontal rule
      case "hr":
        return <div key={index} className="my-6 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />;

      // Headings - fuchsia accented to match substance articles
      case "h1":
        return (
          <h1 key={index} className="mt-10 mb-5 font-display text-[clamp(2rem,1.84rem+0.95vw,2.7rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-fuchsia-200 text-balance">
            {renderChildren(node.children)}
          </h1>
        );

      case "h2":
        return (
          <h2 key={index} className="mt-8 mb-3 font-display text-[clamp(1.45rem,1.32rem+0.55vw,1.85rem)] font-semibold leading-[1.08] tracking-[-0.025em] text-fuchsia-300 text-balance">
            {renderChildren(node.children)}
          </h2>
        );

      case "h3":
        return (
          <h3 key={index} className="mt-6 mb-2 text-[1.125rem] font-semibold leading-[1.24] tracking-[-0.01em] text-fuchsia-300/85 text-balance">
            {renderChildren(node.children)}
          </h3>
        );

      case "h4":
        return (
          <h4 key={index} className="mt-5 mb-2 text-base font-semibold leading-[1.35] text-fuchsia-300/70 text-balance">
            {renderChildren(node.children)}
          </h4>
        );

      // Audio player (placeholder - renders as a simple audio element)
      case "audio-player":
        return (
          <div key={index} className="my-4 p-3 rounded-lg bg-white/5 border border-white/10">
            <p className="text-sm text-white/60 italic">
              🎵 Audio replication: {node.properties?.title || "Audio content"}
              {node.properties?.artist && ` by ${node.properties.artist}`}
            </p>
            {node.properties?.resource && (
              <audio 
                controls 
                className="w-full mt-2"
                src={node.properties.resource}
              >
                <track kind="captions" />
                Your browser does not support the audio element.
              </audio>
            )}
          </div>
        );

      // Fallback for unknown tags - safely handle missing children
      default: {
        console.warn(`Unknown VCode tag: ${node.name}`);
        const children = renderChildren(node.children);
        // If there are no children, return null
        if (!children) return null;
        return (
          <span key={index} className="text-white/60">
            {children}
          </span>
        );
      }
    }
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
