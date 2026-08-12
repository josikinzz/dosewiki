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
 *
 * The two rendered elements are restyleable for the same reason. A surface that
 * shipped its own link or emphasis treatment — the Effect Index homepage draws
 * links in `homePanelLinkClassName`, not the prose-link dotted underline — must
 * not change appearance just because its prose became editable.
 */

const TOKEN_PATTERN = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*/g;

function isExternal(href: string): boolean {
  return /^(https?:\/\/|mailto:|#)/.test(href);
}

export type InlineCopyOptions = {
  /** Overrides the prose-link styling on `[label](/href)`. */
  linkClassName?: string;
  /** Class applied to the `<strong>` rendered for `**phrase**`. */
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
