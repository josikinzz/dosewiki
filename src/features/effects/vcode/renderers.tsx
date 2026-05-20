import { type ReactNode } from "react";

import { CaptionedImage } from "./components/CaptionedImage";
import { Columns, Column } from "./components/Columns";
import { ExtLink } from "./components/ExtLink";
import { HeaderedTextbox } from "./components/HeaderedTextbox";
import { IntLink } from "./components/IntLink";
import { List, ListItem } from "./components/List";
import { Paragraph } from "./components/Paragraph";
import { Quote } from "./components/Quote";
import { Reference } from "./components/Reference";
import { SeparatedTextbox } from "./components/SeparatedTextbox";
import { SubarticleAnchor } from "./components/SubarticleAnchor";
import { TableOfContents } from "./components/TableOfContents";
import { Bold, Italic, Strikethrough, Underline } from "./components/TextFormatting";
import type { NavigateHandler, VCodeNode } from "./types";

export type VCodeRendererContext = {
  citations: Array<{ url: string; text: string; from?: string }>;
  subarticles: Array<{ id: string; title: string }>;
  onNavigate?: NavigateHandler;
  renderChildren: (children: (string | VCodeNode)[] | undefined) => ReactNode;
};

export type VCodeNodeRenderer = (
  node: VCodeNode,
  index: number,
  context: VCodeRendererContext,
) => ReactNode;

function createHeading(
  level: "h1" | "h2" | "h3" | "h4",
  key: number,
  children: ReactNode,
) {
  if (level === "h1") {
    return (
      <h1
        key={key}
        className="mt-10 mb-5 font-display text-[clamp(2rem,1.84rem+0.95vw,2.7rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-fuchsia-200 text-balance"
      >
        {children}
      </h1>
    );
  }

  if (level === "h2") {
    return (
      <h2
        key={key}
        className="mt-8 mb-3 font-display text-[clamp(1.45rem,1.32rem+0.55vw,1.85rem)] font-semibold leading-[1.08] tracking-[-0.025em] text-fuchsia-300 text-balance"
      >
        {children}
      </h2>
    );
  }

  if (level === "h3") {
    return (
      <h3
        key={key}
        className="mt-6 mb-2 text-[1.125rem] font-semibold leading-[1.24] tracking-[-0.01em] text-fuchsia-300/85 text-balance"
      >
        {children}
      </h3>
    );
  }

  return (
    <h4
      key={key}
      className="mt-5 mb-2 text-base font-semibold leading-[1.35] text-fuchsia-300/70 text-balance"
    >
      {children}
    </h4>
  );
}

export function renderMarkdownText(text: string, index: number): ReactNode {
  const normalizedText = text.trim();

  if (!normalizedText) {
    return null;
  }

  const headingMatch = /^(#{1,6})\s+(.*)$/.exec(normalizedText);

  if (!headingMatch) {
    return <Paragraph key={index}>{normalizedText}</Paragraph>;
  }

  const [, headingHashes, headingText] = headingMatch;
  const children = headingText;

  if (headingHashes.length === 1) {
    return createHeading("h1", index, children);
  }

  if (headingHashes.length === 2) {
    return createHeading("h2", index, children);
  }

  if (headingHashes.length === 3) {
    return createHeading("h3", index, children);
  }

  return createHeading("h4", index, children);
}

export const vcodeRenderers: Record<string, VCodeNodeRenderer> = {
  p: (node, index, context) => (
    <Paragraph key={index}>{context.renderChildren(node.children)}</Paragraph>
  ),
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
  "headered-textbox": (node, index, context) => (
    <HeaderedTextbox
      key={index}
      label={node.properties.label}
      header={node.properties.header}
      labelBackground={node.properties.labelBackground}
      headerBackground={node.properties.headerBackground}
    >
      {context.renderChildren(node.children)}
    </HeaderedTextbox>
  ),
  "separated-textbox": (node, index, context) => (
    <SeparatedTextbox
      key={index}
      leftHeader={node.properties.leftHeader || node.properties.a}
      rightHeader={node.properties.rightHeader || node.properties.b}
    >
      {context.renderChildren(node.children)}
    </SeparatedTextbox>
  ),
  panel: (node, index, context) => (
    <div key={index} className="my-6 rounded-xl ring-1 ring-white/5 bg-white/5 p-4">
      {node.properties.title ? (
        <h3 className="mb-4 text-[1.125rem] font-semibold leading-[1.24] tracking-[-0.01em] text-fuchsia-300/85 text-balance">
          {node.properties.title}
        </h3>
      ) : null}
      <div className="space-y-4">{context.renderChildren(node.children)}</div>
    </div>
  ),
  markdown: (node, index) => renderMarkdownText(node.properties.text ?? "", index),
  "captioned-image": (node, index) => (
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
  ),
  quote: (node, index, context) => (
    <Quote key={index} author={node.properties.author} source={node.properties.source}>
      {context.renderChildren(node.children)}
    </Quote>
  ),
  ref: (node, index, context) => (
    <Reference key={index} to={node.properties.to} citations={context.citations} />
  ),
  "int-link": (node, index, context) => (
    <IntLink key={index} to={node.properties.to} onNavigate={context.onNavigate}>
      {context.renderChildren(node.children)}
    </IntLink>
  ),
  "ext-link": (node, index, context) => (
    <ExtLink key={index} to={node.properties.to}>
      {context.renderChildren(node.children)}
    </ExtLink>
  ),
  columns: (node, index, context) => (
    <Columns key={index}>{context.renderChildren(node.children)}</Columns>
  ),
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
      className="my-8 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"
    />
  ),
  h1: (node, index, context) => createHeading("h1", index, context.renderChildren(node.children)),
  h2: (node, index, context) => createHeading("h2", index, context.renderChildren(node.children)),
  h3: (node, index, context) => createHeading("h3", index, context.renderChildren(node.children)),
  h4: (node, index, context) => createHeading("h4", index, context.renderChildren(node.children)),
  "audio-player": (node, index) => (
    <div key={index} className="my-4 rounded-lg border border-white/10 bg-white/5 p-3">
      <p className="text-sm italic text-white/60">
        🎵 Audio replication: {node.properties?.title || "Audio content"}
        {node.properties?.artist && ` by ${node.properties.artist}`}
      </p>
      {node.properties?.resource ? (
        <audio controls className="mt-2 w-full" src={node.properties.resource}>
          <track kind="captions" />
          Your browser does not support the audio element.
        </audio>
      ) : null}
    </div>
  ),
};
