import { Fragment, type ReactNode } from "react";
import Link from "next/link";

import { proseLinkClassName } from "@/components/common/ProseLink";

/**
 * Renderer for short editable copy that carries at most inline links.
 *
 * Editable copy blocks are stored as text, but several of the strings they
 * replaced were JSX carrying a `<Link>` in the middle of a sentence. Running
 * those through a full Markdown renderer would rewrite the surrounding markup
 * (block `<p>`, plain `<a>`), so this understands exactly two inline forms and
 * nothing else:
 *
 * - `[label](/href)` → the site's prose link, internal via `next/link` and
 *   external (any `http(s)://` or `mailto:` target) via a plain anchor.
 * - `**phrase**` → `<strong>`.
 *
 * The result is a fragment, so the caller keeps ownership of the block element
 * and its classes — which is what makes these migrations markup-preserving.
 */

const TOKEN_PATTERN = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*/g;

function isExternal(href: string): boolean {
  return /^(https?:\/\/|mailto:|#)/.test(href);
}

export function renderInlineCopy(text: string): ReactNode {
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
            className={proseLinkClassName}
            target={href.startsWith("#") ? undefined : "_blank"}
            rel={href.startsWith("#") ? undefined : "noreferrer"}
          >
            {linkLabel}
          </a>
        ) : (
          <Link key={`l${match.index}`} href={href} className={proseLinkClassName}>
            {linkLabel}
          </Link>
        ),
      );
    } else if (strong) {
      nodes.push(<strong key={`s${match.index}`}>{strong}</strong>);
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    nodes.push(<Fragment key={`t${cursor}`}>{text.slice(cursor)}</Fragment>);
  }

  return <>{nodes}</>;
}
