import * as React from "react";

import { cn } from "@/lib/utils";

export const proseLinkUnderlineClassName =
  "underline decoration-dotted underline-offset-[0.18em] hover:decoration-solid";

export const proseLinkClassName = `theme-accent-emphasis theme-accent-underline font-medium ${proseLinkUnderlineClassName} transition-colors theme-focus-ring`;

export const quietLinkClassName =
  "theme-text-secondary underline decoration-dose-divider decoration-1 underline-offset-[0.18em] transition hover:text-dose-accent hover:decoration-dose-accent";

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
