import type { ComponentPropsWithoutRef, ReactNode } from "react";
import {
  CitationListItem,
  type CitationListItemProps,
} from "@/components/common/CitationListItem";
import { cn } from "@/lib/utils";

export type ArticleCitationListCitation = {
  anchorId?: string;
  favicon?: string | null;
  faviconSrc?: string | null;
  href?: string;
  id?: string;
  label?: ReactNode;
  number: number;
  role?: string;
  url?: string;
};

export type ArticleCitationListProps = Omit<
  ComponentPropsWithoutRef<"ol">,
  "children"
> & {
  citations: readonly ArticleCitationListCitation[];
  getKey?: (citation: ArticleCitationListCitation, index: number) => string;
  itemClassName?: string;
  showHref?: CitationListItemProps["showHref"];
  truncateLabels?: CitationListItemProps["truncateLabel"];
};

export function ArticleCitationList({
  citations,
  className,
  getKey,
  itemClassName,
  showHref = false,
  truncateLabels = true,
  ...props
}: ArticleCitationListProps) {
  return (
    <ol className={cn("flex list-none flex-wrap items-center gap-2 p-0", className)} {...props}>
      {citations.map((citation, index) => {
        const href = citation.href ?? citation.url;
        const faviconSrc = citation.faviconSrc ?? citation.favicon;

        return (
          <CitationListItem
            id={citation.anchorId ?? citation.id}
            key={
              getKey?.(citation, index) ??
              `${citation.role ?? "citation"}-${citation.anchorId ?? citation.id ?? href ?? index}-${citation.number}`
            }
            number={citation.number}
            label={citation.label}
            href={href}
            faviconSrc={faviconSrc}
            showHref={showHref}
            truncateLabel={truncateLabels}
            className={itemClassName}
          />
        );
      })}
    </ol>
  );
}
