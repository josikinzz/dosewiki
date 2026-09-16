import { Fragment, type ReactNode } from "react";

import { CaptionedImage } from "./components/CaptionedImage";
import { Columns, Column } from "./components/Columns";
import { EffectListPanel } from "./components/EffectListPanel";
import { ExtLink } from "./components/ExtLink";
import { HeaderedTextbox, type HeaderedTextboxPresentation } from "./components/HeaderedTextbox";
import { IntLink } from "./components/IntLink";
import { List, ListItem } from "./components/List";
import { Paragraph } from "./components/Paragraph";
import { Quote } from "./components/Quote";
import { Reference } from "./components/Reference";
import { SeparatedTextbox } from "./components/SeparatedTextbox";
import { SubarticleAnchor } from "./components/SubarticleAnchor";
import { TableOfContents } from "./components/TableOfContents";
import { Bold, Italic, Strikethrough, Underline } from "./components/TextFormatting";
import { flattenVCodeHeadingText, formatHeaderedTextboxTitle } from "./headings";
import { extractVCodePanelSections } from "./panelModel";
import type { VCodeNode } from "./types";
import { cn } from "@/lib/utils";
import {
  resolveArtistCreditLink,
  type ArtistCreditLinks,
} from "./artistCreditLinks";
import { selectImageRoute } from "./imageRoutes";

type VCodeRendererContext = {
  citations: Array<{ url: string; text: string; from?: string }>;
  subarticles: Array<{ id: string; title: string }>;
  renderChildren: (children: (string | VCodeNode)[] | undefined) => ReactNode;
  renderNode: (node: string | VCodeNode, index: number) => ReactNode;
  /**
   * Supplied only where headings are anchor targets (pages with a contents
   * rail). Must be the same order-dependent assigner the table of contents
   * used, so ids agree on repeated titles.
   */
  assignHeadingId?: (text: string) => string | undefined;
  headeredTextboxPresentation?: HeaderedTextboxPresentation;
  headeredTextboxHeadingLevel?: 2 | 3;
  /**
   * Credit-line destinations for embedded replication images. Supplied only
   * by surfaces that load the gallery corpus; absent leaves bylines plain.
   */
  artistCreditLinks?: ArtistCreditLinks;
  renderArtistCredit?: (artist: string) => ReactNode;
  /**
   * The drug class this surface speaks for ("deliriant", "psychedelic"). Set
   * only by per-class summary pages; it selects an embed's `imageRoutes`
   * variant where one exists.
   */
  mediaVariantKey?: string;
}

export type VCodeNodeRenderer = (
  node: VCodeNode,
  index: number,
  context: VCodeRendererContext,
) => ReactNode;

function createHeading(
  level: "h1" | "h2" | "h3" | "h4",
  key: number,
  children: ReactNode,
  id?: string,
) {
  // Anchored headings clear the sticky site header when jumped to.
  const anchorClassName = id ? "scroll-mt-24" : undefined;

  if (level === "h1") {
    return (
      <h1
        key={key}
        id={id}
        className={cn(
          "theme-accent-heading mt-10 mb-5 font-display text-[clamp(2rem,1.84rem+0.95vw,2.7rem)] font-semibold leading-[1.02] text-balance",
          anchorClassName,
        )}
      >
        {children}
      </h1>
    );
  }

  if (level === "h2") {
    return (
      <h2
        key={key}
        id={id}
        className={cn(
          "theme-accent-heading mt-8 mb-3 font-display text-[clamp(1.45rem,1.32rem+0.55vw,1.85rem)] font-semibold leading-[1.08] text-balance",
          anchorClassName,
        )}
      >
        {children}
      </h2>
    );
  }

  if (level === "h3") {
    return (
      <h3
        key={key}
        id={id}
        className={cn(
          "theme-accent-heading mt-6 mb-2 text-[1.125rem] font-semibold leading-[1.24] text-balance",
          anchorClassName,
        )}
      >
        {children}
      </h3>
    );
  }

  return (
    <h4
      key={key}
      id={id}
      className={cn(
        "theme-accent-heading mt-5 mb-2 text-base font-semibold leading-[1.35] text-balance",
        anchorClassName,
      )}
    >
      {children}
    </h4>
  );
}

function renderMarkdownText(
  text: string,
  index: number,
  context?: VCodeRendererContext,
): ReactNode {
  const normalizedText = text.trim();

  if (!normalizedText) {
    return null;
  }

  if (normalizedText.includes("\n")) {
    return <Fragment key={index}>{renderMarkdownBlocks(normalizedText, context)}</Fragment>;
  }

  return renderMarkdownBlock(normalizedText, index, context);
}

function renderMarkdownBlocks(text: string, context?: VCodeRendererContext): ReactNode[] {
  return text.split(/\n{2,}/).flatMap<ReactNode>((block, blockIndex) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);

    if (lines.length === 0) {
      return [];
    }

    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      return [
        <List key={`block-${blockIndex}`} ordered={false}>
          {lines.map((line, lineIndex) => (
            <ListItem key={lineIndex}>{line.replace(/^[-*]\s+/, "")}</ListItem>
          ))}
        </List>,
      ];
    }

    return lines.map((line, lineIndex) =>
      renderMarkdownBlock(line, blockIndex * 1000 + lineIndex, context),
    );
  });
}

function renderMarkdownBlock(
  normalizedText: string,
  index: number,
  context?: VCodeRendererContext,
): ReactNode {
  const headingMatch = /^(#{1,6})\s+(.*)$/.exec(normalizedText);

  if (!headingMatch) {
    return <Paragraph key={index}>{normalizedText}</Paragraph>;
  }

  const [, headingHashes, headingText] = headingMatch;
  const id = context?.assignHeadingId?.(headingText);

  if (headingHashes.length === 1) {
    return createHeading("h1", index, headingText, id);
  }

  if (headingHashes.length === 2) {
    return createHeading("h2", index, headingText, id);
  }

  if (headingHashes.length === 3) {
    return createHeading("h3", index, headingText, id);
  }

  return createHeading("h4", index, headingText, id);
}

/** Nodes that render something without carrying children. */
const VOID_NODE_NAMES = new Set([
  "audio-player",
  "captioned-image",
  "hr",
  "ref",
  "toc",
  "youtube-embed",
]);

const BLOCK_NODE_NAMES = new Set([
  "audio-player",
  "captioned-image",
  "columns",
  "headered-textbox",
  "hr",
  "ol",
  "panel",
  "quote",
  "separated-textbox",
  "subarticle",
  "toc",
  "ul",
]);

function isBlockNode(node: string | VCodeNode): node is VCodeNode {
  return typeof node !== "string" && BLOCK_NODE_NAMES.has(node.name);
}

/** Whether a node would put anything on the page. */
function hasRenderableContent(node: string | VCodeNode): boolean {
  if (node == null) {
    return false;
  }

  if (typeof node === "string") {
    return node.trim().length > 0;
  }

  if (node.name === "markdown") {
    return (node.properties?.text ?? "").trim().length > 0;
  }

  // A void element is content in its own right; everything else is only as
  // substantial as what it wraps.
  if (VOID_NODE_NAMES.has(node.name)) {
    return true;
  }

  return (node.children ?? []).some(hasRenderableContent);
}

function renderParagraphNode(
  node: VCodeNode,
  index: number,
  context: VCodeRendererContext,
): ReactNode {
  const children = node.children ?? [];
  const chunks: ReactNode[] = [];
  let inlineRun: (string | VCodeNode)[] = [];
  let chunkIndex = 0;

  const flushInlineRun = () => {
    if (inlineRun.length === 0) return;

    chunks.push(
      <Paragraph key={`p-${chunkIndex++}`}>
        {inlineRun.map((child, childIndex) => context.renderNode(child, childIndex))}
      </Paragraph>,
    );
    inlineRun = [];
  };

  children.forEach((child, childIndex) => {
    if (isBlockNode(child)) {
      flushInlineRun();
      chunks.push(
        <div key={`block-${chunkIndex++}`} className="my-5">
          {context.renderNode(child, childIndex)}
        </div>,
      );
      return;
    }

    inlineRun.push(child);
  });

  flushInlineRun();

  if (chunks.length === 0) {
    return null;
  }

  return <div key={index}>{chunks}</div>;
}

export const vcodeRenderers: Record<string, VCodeNodeRenderer> = {
  p: (node, index, context) => renderParagraphNode(node, index, context),
  b: (node, index, context) => (
    <Bold key={index}>{context.renderChildren(node.children)}</Bold>
  ),
  i: (node, index, context) => (
    <Italic key={index}>{context.renderChildren(node.children)}</Italic>
  ),
  u: (node, index, context) => (
    <Underline key={index}>{context.renderChildren(node.children)}</Underline>
  ),
  s: (node, index, context) => (
    <Strikethrough key={index}>{context.renderChildren(node.children)}</Strikethrough>
  ),
  sup: (node, index, context) => (
    <sup key={index} className="theme-text-muted text-[0.72em]">
      {context.renderChildren(node.children)}
    </sup>
  ),
  "headered-textbox": (node, index, context) => {
    // Claimed before the body renders, so ids stay in the document order the
    // table of contents walked.
    const id = context.assignHeadingId?.(
      formatHeaderedTextboxTitle(node.properties.label, node.properties.header),
    );

    return (
      <HeaderedTextbox
        key={index}
        id={id}
        label={node.properties.label}
        header={node.properties.header}
        labelBackground={node.properties.labelBackground}
        headerBackground={node.properties.headerBackground}
        presentation={context.headeredTextboxPresentation}
        headingLevel={context.headeredTextboxHeadingLevel}
      >
        {context.renderChildren(node.children)}
      </HeaderedTextbox>
    );
  },
  "separated-textbox": (node, index, context) => (
    <SeparatedTextbox
      key={index}
      leftHeader={node.properties.leftHeader || node.properties.a}
      rightHeader={node.properties.rightHeader || node.properties.b}
    >
      {context.renderChildren(node.children)}
    </SeparatedTextbox>
  ),
  panel: (node, index, context) => {
    // Claimed before anything inside the panel, because `extractVCodeHeadings`
    // visits a titled block's own title first and the assigner is order-bound.
    const id = context.assignHeadingId?.(node.properties.title ?? "");
    const title = node.properties.title?.trim();
    const sections = title ? extractVCodePanelSections(node.children) : null;

    if (title && sections) {
      // Section headings would have claimed their ids as `h3` nodes, so they
      // still claim them here — in the same document order — even though they
      // now render as section labels rather than headings.
      const sectionIds = sections.map((section) =>
        section.title ? context.assignHeadingId?.(section.title) : undefined,
      );

      return (
        <EffectListPanel
          key={index}
          id={id}
          title={title}
          sourceIcon={node.properties.icon}
          sections={sections}
          sectionIds={sectionIds}
        />
      );
    }

    return (
      <div key={index}>
        {title ? (
          <h3
            id={id}
            className={cn(
              "theme-accent-heading mb-3 text-[1.125rem] font-semibold leading-[1.24] text-balance",
              id ? "scroll-mt-24" : undefined,
            )}
          >
            {title}
          </h3>
        ) : null}
        <div className="space-y-4">{context.renderChildren(node.children)}</div>
      </div>
    );
  },
  markdown: (node, index, context) => renderMarkdownText(node.properties.text ?? "", index, context),
  "captioned-image": (node, index, context) => {
    // A summary page for one drug class draws that class's variant of the
    // embed when the article carries one; every other surface keeps the
    // embed's own media.
    const variant = selectImageRoute(
      node.properties.imageRoutes,
      context.mediaVariantKey,
    );
    const artist = variant?.artist ?? node.properties.artist;
    const credit = resolveArtistCreditLink(context.artistCreditLinks, artist);

    return (
      <CaptionedImage
        key={index}
        src={variant?.src ?? node.properties.src}
        width={node.properties.width}
        artist={artist}
        artistHref={credit?.href}
        artistHrefExternal={credit?.external}
        artistCredit={artist ? context.renderArtistCredit?.(artist) : undefined}
        title={variant?.title ?? node.properties.title}
        caption={variant?.caption ?? node.properties.caption}
        align={node.properties.align as "left" | "right" | "center"}
        border={node.properties.border === "true"}
        top={node.properties.top === "true"}
      />
    );
  },
  quote: (node, index, context) => (
    <Quote key={index} author={node.properties.author} source={node.properties.source}>
      {context.renderChildren(node.children)}
    </Quote>
  ),
  ref: (node, index, context) => (
    <Reference key={index} to={node.properties.to} citations={context.citations} />
  ),
  "int-link": (node, index, context) => (
    <IntLink key={index} to={node.properties.to}>
      {context.renderChildren(node.children)}
    </IntLink>
  ),
  "ext-link": (node, index, context) => (
    <ExtLink key={index} to={node.properties.to}>
      {context.renderChildren(node.children)}
    </ExtLink>
  ),
  columns: (node, index, context) => {
    // Effect Index pads every group out to three columns and leaves the spare
    // ones empty. Rendered as-is those become blank cards sitting beside the
    // real ones, so they never reach the layout.
    const columns = (node.children ?? []).filter(hasRenderableContent);

    if (columns.length === 0) {
      return null;
    }

    return (
      <Columns key={index}>
        {columns.map((column, columnIndex) => context.renderNode(column, columnIndex))}
      </Columns>
    );
  },
  column: (node, index, context) => (
    <Column key={index}>{context.renderChildren(node.children)}</Column>
  ),
  ul: (node, index, context) => (
    <List key={index} ordered={false}>
      {context.renderChildren(node.children)}
    </List>
  ),
  ol: (node, index, context) => (
    <List key={index} ordered={true}>
      {context.renderChildren(node.children)}
    </List>
  ),
  li: (node, index, context) => (
    <ListItem key={index}>{context.renderChildren(node.children)}</ListItem>
  ),
  subarticle: (node, index, context) => (
    <SubarticleAnchor key={index} id={node.properties.id} title={node.properties.title}>
      {context.renderChildren(node.children)}
    </SubarticleAnchor>
  ),
  toc: (_node, index, context) => (
    <TableOfContents key={index} subarticles={context.subarticles} />
  ),
  br: (_node, index) => <br key={index} />,
  hr: (_node, index) => (
    <div
      key={index}
      className="theme-horizontal-divider my-8"
    />
  ),
  h1: (node, index, context) => {
    const id = context.assignHeadingId?.(flattenVCodeHeadingText(node.children));

    return createHeading("h1", index, context.renderChildren(node.children), id);
  },
  h2: (node, index, context) => {
    const id = context.assignHeadingId?.(flattenVCodeHeadingText(node.children));

    return createHeading("h2", index, context.renderChildren(node.children), id);
  },
  h3: (node, index, context) => {
    const id = context.assignHeadingId?.(flattenVCodeHeadingText(node.children));

    return createHeading("h3", index, context.renderChildren(node.children), id);
  },
  h4: (node, index, context) => {
    const id = context.assignHeadingId?.(flattenVCodeHeadingText(node.children));

    return createHeading("h4", index, context.renderChildren(node.children), id);
  },
  "audio-player": (node, index) => (
    <div key={index} className="theme-horizontal-divider-block my-5 py-4">
      <p className="theme-text-muted text-sm italic">
        🎵 Audio replication: {node.properties?.title || "Audio content"}
        {node.properties?.artist && ` by ${node.properties.artist}`}
      </p>
      {node.properties?.resource || node.properties?.src ? (
        <audio
          controls
          className="mt-2 w-full"
          src={node.properties.resource || node.properties.src}
        >
          <track kind="captions" />
          Your browser does not support the audio element.
        </audio>
      ) : null}
    </div>
  ),
  "youtube-embed": (node, index) => (
    <div
      key={index}
      className="theme-public-card-subtle my-7 overflow-hidden rounded-2xl border"
    >
      <iframe
        className="aspect-video w-full"
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(node.properties.src ?? "")}`}
        title={node.properties.title || "YouTube video"}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  ),
};
