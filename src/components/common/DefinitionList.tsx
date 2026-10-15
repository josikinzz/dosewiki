import * as React from "react";

import { cn } from "@/lib/utils";

const definitionRowClassName = "grid gap-x-6 gap-y-1.5 py-4 first:pt-0 last:pb-0 sm:grid-cols-[14rem_1fr]"

export type DefinitionRowProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "title"
> & {
  term: React.ReactNode;
  children: React.ReactNode;
  semantic?: boolean;
  termClassName?: string;
  bodyClassName?: string;
};

export const DefinitionRow = React.forwardRef<HTMLDivElement, DefinitionRowProps>(
  function DefinitionRow(
    { term, children, semantic, termClassName, bodyClassName, className, ...props },
    ref,
  ) {
    return (
      <div ref={ref} className={cn(definitionRowClassName, className)} {...props}>
        {semantic ? (
          <>
            <dt className={termClassName}>{term}</dt>
            <dd className={bodyClassName}>{children}</dd>
          </>
        ) : (
          <>
            {term}
            {children}
          </>
        )}
      </div>
    );
  },
);

export type DefinitionListProps = React.HTMLAttributes<HTMLDListElement>;

export const DefinitionList = React.forwardRef<HTMLDListElement, DefinitionListProps>(
  function DefinitionList({ children, className, ...props }, ref) {
    return (
      <dl ref={ref} className={className} {...props}>
        {children}
      </dl>
    );
  },
);
