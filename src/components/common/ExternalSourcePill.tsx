import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

export type ExternalSourcePillProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children" | "aria-label"
> & {
  ariaLabel?: string;
  href?: string;
  label: ReactNode;
  prefix?: ReactNode;
  suffix?: ReactNode;
  faviconSrc?: string;
  faviconAlt?: string;
  rel?: ComponentPropsWithoutRef<"a">["rel"];
  target?: ComponentPropsWithoutRef<"a">["target"];
  variant?: "inline" | "credit";
};

export function ExternalSourcePill({
  ariaLabel,
  label,
  prefix = "Powered by",
  suffix,
  faviconSrc,
  faviconAlt = "",
  className,
  href,
  target = "_blank",
  rel = "noopener noreferrer",
  variant = "inline",
  ...props
}: ExternalSourcePillProps) {
  const fallbackAriaLabel =
    typeof prefix === "string" && typeof label === "string"
      ? `${prefix} ${label}`
      : undefined;
  const isCredit = variant === "credit";

  return (
    <div
      className={cn(
        "theme-external-source-pill group relative ring-1 transition",
        isCredit
          ? "grid w-full max-w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1 rounded-2xl px-3 py-2.5 sm:inline-flex sm:w-auto sm:flex-nowrap sm:gap-2.5 sm:rounded-full sm:px-3 sm:py-1.5 sm:pr-4"
          : "flex items-center gap-2.5 rounded-full px-3 py-1.5 pr-4",
        className,
      )}
      data-external-source-variant={variant}
      {...props}
    >
      {href ? (
        <a
          href={href}
          target={target}
          rel={rel}
          aria-label={ariaLabel ?? fallbackAriaLabel}
          className="theme-focus-ring absolute inset-0 z-10 rounded-[inherit]"
        />
      ) : null}
      <span
        className={cn(
          "theme-text-faint text-xs transition group-hover:opacity-90",
          isCredit
            ? "col-span-full min-w-0 pr-5 text-[0.73rem] font-medium leading-4 [text-wrap:pretty] sm:col-auto sm:pr-0 sm:text-xs sm:leading-none"
            : undefined,
        )}
      >
        {prefix}
      </span>
      {faviconSrc ? (
        <AppImage
          src={faviconSrc}
          alt={faviconAlt}
          width={20}
          height={20}
          className="h-5 w-5 rounded"
        />
      ) : null}
      <span
        className={cn(
          "min-w-0 text-xs font-semibold text-current transition",
          isCredit
            ? "leading-4 [overflow-wrap:anywhere] sm:-ml-1 sm:whitespace-nowrap"
            : "-ml-1",
        )}
      >
        {label}
      </span>
      {suffix ? (
        <span
          className={cn(
            "theme-text-faint text-xs transition group-hover:opacity-90",
            isCredit
              ? "whitespace-nowrap text-[0.73rem] font-medium leading-4 sm:-ml-1 sm:text-xs"
              : "-ml-1",
          )}
        >
          {suffix}
        </span>
      ) : null}
      <Icon
        icon="lucide:external-link"
        size={12}
        className={cn(
          "theme-external-link-badge-icon shrink-0 text-current opacity-60 transition group-hover:opacity-90",
          isCredit ? "justify-self-end" : "-ml-1",
        )}
      />
    </div>
  );
}
