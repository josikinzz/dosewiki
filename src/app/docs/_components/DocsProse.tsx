import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { proseLinkClassName } from "@/components/common/ProseLink";

/**
 * Inline-markdown renderer for the docs pages' editable prose.
 *
 * The docs pages keep their exact layout DOM in TSX — every `<p>`, `<li>`,
 * `<dd>`, card body, and table cell stays in code with its original classes —
 * and only the text inside each element comes from a `copyBlocks` markdown
 * body (editable in the /dev Copy Studio). This component therefore renders a
 * markdown string as *inline* content: paragraphs are unwrapped into
 * fragments so the surrounding TSX element remains the block container, and
 * `code`/`strong`/`em` render as the bare elements the pages always used.
 *
 * Anchors reproduce the three link shapes the docs pages hardcoded:
 * hash/mailto links are plain prose links, internal App Paths carry
 * `target="_top"`, and external URLs open a new tab with
 * `rel="noopener noreferrer"`.
 */
const docsInlineComponents = {
  p: ({ node: _node, children }: { node?: unknown; children?: ReactNode }) => <>{children}</>,
  a: ({
    node: _node,
    children,
    href,
    ...rest
  }: {
    node?: unknown;
    children?: ReactNode;
    href?: string;
  }) => {
    const isExternal = typeof href === "string" && /^https?:\/\//i.test(href);
    const isInternalPath = typeof href === "string" && href.startsWith("/");
    return (
      <a
        className={proseLinkClassName}
        href={href}
        target={isExternal ? "_blank" : isInternalPath ? "_top" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        {...rest}
      >
        {children}
      </a>
    );
  },
};

export function DocsInline({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={docsInlineComponents}>
      {children}
    </ReactMarkdown>
  );
}
