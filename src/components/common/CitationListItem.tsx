import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { AppImage } from "@/components/common/AppImage";
import { ArticleSubsectionCard } from "@/components/common/ArticleSection";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

export type CitationListItemProps = Omit<
  ComponentPropsWithoutRef<"li">,
  "children"
> & {
  number: number;
  label?: ReactNode;
  href?: string;
  faviconSrc?: string | null;
  showHref?: boolean;
};

export function CitationListItem({
  number,
  label,
  href,
  faviconSrc,
  showHref = false,
  className,
  ...props
}: CitationListItemProps) {
  return (
    <ArticleSubsectionCard
      asChild
      variant="interactive"
      padding="xs"
      className={cn("theme-evidence-surface flex items-start gap-3", className)}
    >
      <li {...props}>
        {faviconSrc ? (
          <AppImage
            src={faviconSrc}
            alt=""
            width={20}
            height={20}
            className="mt-0.5 h-5 w-5 shrink-0 rounded"
          />
        ) : (
          <span className="theme-evidence-badge flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
            {number}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {href && !showHref ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="theme-evidence-link text-sm leading-relaxed underline-offset-2"
            >
              {label}
            </a>
          ) : (
            <span className="theme-text-primary text-sm leading-relaxed">
              {label}
            </span>
          )}

          {href && showHref ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="theme-evidence-link mt-1 flex items-center gap-1 text-xs"
            >
              <Icon icon="lucide:external-link" size={12} className="shrink-0" />
              <span className="truncate">{href}</span>
            </a>
          ) : null}
        </div>
      </li>
    </ArticleSubsectionCard>
  );
}
