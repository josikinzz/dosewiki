import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { PublicNameChip } from "@/components/common/PublicTokens";
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
  truncateLabel?: boolean;
};

export function CitationListItem({
  number,
  label,
  href,
  faviconSrc,
  showHref = false,
  truncateLabel = true,
  className,
  ...props
}: CitationListItemProps) {
  const content = (
    <>
      {faviconSrc ? (
        <AppImage
          src={faviconSrc}
          alt=""
          width={16}
          height={16}
          className="h-4 w-4 shrink-0 rounded"
        />
      ) : (
        <span
          aria-hidden="true"
          className="theme-reference-number flex h-[1.125rem] min-w-[1.125rem] shrink-0 items-center justify-center rounded-full px-1 text-[0.625rem] font-medium leading-none"
        >
          {number}
        </span>
      )}
      <span className={cn("min-w-0", truncateLabel ? "truncate" : "whitespace-normal wrap-anywhere")}>
        {label}
      </span>
      {href && showHref ? (
        <Icon icon="lucide:external-link" size={12} className="theme-text-faint shrink-0" />
      ) : null}
    </>
  );

  return (
    <li
      className={cn(
        "theme-navigation-target inline-flex flex-none scroll-mt-20 align-top",
        truncateLabel ? "max-w-[min(18rem,100%)]" : "max-w-full",
        className,
      )}
      {...props}
    >
      {href ? (
        <PublicNameChip
          as="a"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          interactive
          className={cn("max-w-full", truncateLabel ? "whitespace-nowrap" : "whitespace-normal text-left")}
        >
          {content}
        </PublicNameChip>
      ) : (
        <PublicNameChip className={cn("max-w-full", truncateLabel ? "whitespace-nowrap" : "whitespace-normal text-left")}>
          {content}
        </PublicNameChip>
      )}
    </li>
  );
}
