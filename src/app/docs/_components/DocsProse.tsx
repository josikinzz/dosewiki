import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { proseLinkClassName } from "@/components/common/ProseLink";

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
