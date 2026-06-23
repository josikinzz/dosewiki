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
  "theme-accent-emphasis font-medium underline decoration-dotted underline-offset-2 transition-colors hover:decoration-solid focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent-strong";

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
