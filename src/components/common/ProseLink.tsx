import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Shared treatment for links inside long-form prose. Under Tailwind Preflight a
 * bare <a> inherits body color with no underline, so prose links must opt in to
 * an accent treatment: accent-emphasis text, a dotted underline that solidifies
 * on hover, and a visible focus ring. Centralizing it here keeps cross-linked
 * prose pages (e.g. the /docs/* set) reading identically.
 *
 * Use `proseLinkClassName` when you already have an <a> (or a Next <Link>) with
 * its own href/target/rel and only need the styling; use the `ProseLink`
 * component for a plain inline anchor. The :hover is a Tailwind utility, so it
 * is auto-guarded under @media (hover: hover).
 */
export const proseLinkClassName =
  "theme-accent-emphasis theme-accent-underline font-medium underline decoration-dotted underline-offset-2 transition-colors hover:decoration-solid theme-focus-ring";

/**
 * Links inside a quiet meta caption: the roadmap note under a section heading,
 * the guide line beside a substance's effects. The caption is faint by design,
 * so an accent-emphasis prose link inside it would outshout the sentence it
 * sits in. This treatment keeps the link at secondary text weight with a
 * hairline underline that takes the accent on hover.
 */
export const quietLinkClassName =
  "theme-text-secondary underline decoration-dose-divider decoration-1 underline-offset-[3px] transition hover:text-dose-accent hover:decoration-dose-accent";

export type ProseLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement>;

export const ProseLink = React.forwardRef<HTMLAnchorElement, ProseLinkProps>(
  function ProseLink({ className, children, ...props }, ref) {
    return (
      <a ref={ref} className={cn(proseLinkClassName, className)} {...props}>
        {children}
      </a>
    );
  },
);
