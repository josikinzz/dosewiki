import { isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { proseLinkClassName } from "@/components/common/ProseLink";
import { Icon } from "@/components/common/Icon";

import { createVCodeHeadingIdAssigner } from "@/features/effects/vcode/headings";

/** Plain text of a rendered heading, so a heading wrapping a link still slugs. */
function flattenHeadingChildren(children: ReactNode): string {
  if (children == null || typeof children === "boolean") {
    return "";
  }

  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }

  if (Array.isArray(children)) {
    return children.map(flattenHeadingChildren).join("");
  }

  if (isValidElement(children)) {
    return flattenHeadingChildren((children.props as { children?: ReactNode }).children);
  }

  return "";
}

/**
 * The shared component map for reader-facing Markdown prose (About mission copy, the
 * archived Effect Index blog). Every element is styled with theme tokens rather than raw
 * colours, so the same map renders correctly under both site flavors' skins.
 *
 * Extracted from `AboutMissionMarkdown` unchanged; that page still composes it and
 * overrides only its first paragraph.
 */
export const publicMarkdownComponents = {
  p: ({ node: _node, ...props }: { node?: unknown }) => (
    <p className="theme-text-secondary mt-4 text-[1.0625rem] leading-7 first:mt-0" {...props} />
  ),
  strong: ({ node: _node, ...props }: { node?: unknown }) => <strong className="theme-accent-emphasis font-semibold" {...props} />,
  a: ({ node: _node, ...props }: { node?: unknown; children?: ReactNode; href?: string }) => {
    const { children, href, ...rest } = props;
    // Only true external links open a new tab. Hash links must stay in-page so
    // the About tabs' hashchange listener can switch panels, and internal
    // routes/mailto should navigate normally.
    const isExternal = typeof href === "string" && /^https?:\/\//i.test(href);
    if (isExternal) {
      return (
        <a
          className={`${proseLinkClassName} inline-flex items-center gap-0.5`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          {...rest}
        >
          {children}
          <Icon icon="lucide:external-link" size={12} className="opacity-60" />
        </a>
      );
    }
    return (
      <a className={proseLinkClassName} href={href} {...rest}>
        {children}
      </a>
    );
  },
  ul: ({ node: _node, ...props }: { node?: unknown }) => (
    <ul className="theme-text-secondary mt-4 list-disc space-y-2 pl-6 text-[1.0625rem] marker:text-dose-accent-muted" {...props} />
  ),
  ol: ({ node: _node, ...props }: { node?: unknown }) => (
    <ol className="theme-text-secondary mt-4 list-decimal space-y-2 pl-6 text-[1.0625rem] marker:text-dose-accent-muted" {...props} />
  ),
  li: ({ node: _node, ...props }: { node?: unknown }) => <li className="pl-1" {...props} />,
  h1: ({ node: _node, children, ...props }: { node?: unknown; children?: ReactNode }) => (
    <h1 className="theme-accent-heading mt-8 mb-4 text-2xl font-bold" {...props}>{children}</h1>
  ),
  h2: ({ node: _node, children, ...props }: { node?: unknown; children?: ReactNode }) => (
    <h2 className="theme-accent-heading mt-8 mb-4 text-xl font-bold" {...props}>{children}</h2>
  ),
  h3: ({ node: _node, children, ...props }: { node?: unknown; children?: ReactNode }) => (
    <h3 className="theme-accent-heading mt-6 mb-3 text-lg font-bold" {...props}>{children}</h3>
  ),
  blockquote: ({ node: _node, ...props }: { node?: unknown }) => (
    <blockquote className="theme-public-card-subtle mt-6 rounded-2xl border p-4 italic theme-text-secondary" {...props} />
  ),
};

/**
 * The same map with anchor ids on h1–h3, assigned in document order by the
 * shared VCode assigner. That sharing is the point: a Markdown article's
 * contents rail is built by `extractMarkdownHeadings`, which runs the same
 * assigner over the same headings in the same order, so the two agree on every
 * anchor — including the `-2` suffix a repeated title takes.
 *
 * A fresh assigner per render keeps the numbering stable; the map is therefore
 * built per call rather than hoisted to module scope. A page that renders one
 * body as several pieces passes its own assigner instead, so the numbering
 * runs across the pieces rather than restarting in each.
 */
function createHeadingIdComponents(
  assignHeadingId: (text: string) => string | undefined = createVCodeHeadingIdAssigner(),
) {
  const idFor = (children: ReactNode) => assignHeadingId(flattenHeadingChildren(children));

  return {
    ...publicMarkdownComponents,
    h1: ({ node: _node, children, ...props }: { node?: unknown; children?: ReactNode }) => (
      <h1 id={idFor(children)} className="theme-accent-heading mt-8 mb-4 text-2xl font-bold" {...props}>{children}</h1>
    ),
    h2: ({ node: _node, children, ...props }: { node?: unknown; children?: ReactNode }) => (
      <h2 id={idFor(children)} className="theme-accent-heading mt-8 mb-4 text-xl font-bold" {...props}>{children}</h2>
    ),
    h3: ({ node: _node, children, ...props }: { node?: unknown; children?: ReactNode }) => (
      <h3 id={idFor(children)} className="theme-accent-heading mt-6 mb-3 text-lg font-bold" {...props}>{children}</h3>
    ),
  };
}

/**
 * Render a Markdown string with the shared public prose styling.
 *
 * `headingIds` mirrors `VCodeRenderer`'s prop of the same name: off by default,
 * because most callers (About copy, the archived blog) render prose with no
 * contents rail pointing into it, and an unnecessary DOM id can collide with a
 * surrounding section's. `assignHeadingId` mirrors that renderer's prop too,
 * and implies `headingIds`.
 */
export function PublicMarkdownBody({
  content,
  className = "max-w-none",
  headingIds = false,
  assignHeadingId,
}: {
  content: string;
  className?: string;
  headingIds?: boolean;
  assignHeadingId?: (text: string) => string | undefined;
}) {
  const components = assignHeadingId
    ? createHeadingIdComponents(assignHeadingId)
    : headingIds
      ? createHeadingIdComponents()
      : publicMarkdownComponents;

  return (
    <div className={className}>
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
