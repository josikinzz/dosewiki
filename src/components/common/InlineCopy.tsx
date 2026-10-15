import { Fragment, type ReactNode } from "react";
import Link from "next/link";

import { proseLinkClassName } from "@/components/common/ProseLink";

const TOKEN_PATTERN = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*/g;

function isExternal(href: string): boolean {
  return /^(https?:\/\/|mailto:|#)/.test(href);
}

export type InlineCopyOptions = {
  linkClassName?: string;
  strongClassName?: string;
};

export function renderInlineCopy(text: string, options: InlineCopyOptions = {}): ReactNode {
  const linkClassName = options.linkClassName ?? proseLinkClassName;
  if (!text) {
    return null;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  TOKEN_PATTERN.lastIndex = 0;
  while ((match = TOKEN_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(
        <Fragment key={`t${cursor}`}>{text.slice(cursor, match.index)}</Fragment>,
      );
    }

    const [, linkLabel, href, strong] = match;
    if (linkLabel && href) {
      nodes.push(
        isExternal(href) ? (
          <a
            key={`l${match.index}`}
            href={href}
            className={linkClassName}
            target={href.startsWith("#") ? undefined : "_blank"}
            rel={href.startsWith("#") ? undefined : "noreferrer"}
          >
            {linkLabel}
          </a>
        ) : (
          <Link key={`l${match.index}`} href={href} className={linkClassName}>
            {linkLabel}
          </Link>
        ),
      );
    } else if (strong) {
      nodes.push(
        <strong key={`s${match.index}`} className={options.strongClassName}>
          {strong}
        </strong>,
      );
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    nodes.push(<Fragment key={`t${cursor}`}>{text.slice(cursor)}</Fragment>);
  }

  return <>{nodes}</>;
}
