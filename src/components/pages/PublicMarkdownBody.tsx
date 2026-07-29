import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

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
    return (
      <a
        className="theme-link-muted font-medium transition hover:underline hover:decoration-dose-accent-muted hover:underline-offset-2"
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        {...rest}
      >
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

/** Render a Markdown string with the shared public prose styling. */
export function PublicMarkdownBody({
  content,
  className = "max-w-none",
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={publicMarkdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
