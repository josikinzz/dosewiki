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
          ? // Credit copy is a sentence: lay it out as wrapping inline text so
            // the attribution reads in flow instead of on its own row.
            "block w-full max-w-full rounded-2xl px-3 py-2 leading-5 sm:w-auto"
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
            ? "text-[0.73rem] font-medium [text-wrap:pretty] sm:text-xs"
            : undefined,
        )}
      >
        {prefix}
      </span>{" "}
      {faviconSrc ? (
        <AppImage
          src={faviconSrc}
          alt={faviconAlt}
          width={20}
          height={20}
          className={cn(
            "h-5 w-5 rounded",
            isCredit && "mr-1 inline-block align-text-bottom",
          )}
        />
      ) : null}
      <span
        className={cn(
          "min-w-0 text-xs font-semibold text-current transition",
          isCredit
            ? "text-[0.73rem] sm:text-xs"
            : "-ml-1",
        )}
      >
        {label}
      </span>{" "}
      {suffix ? (
        <span
          className={cn(
            "theme-text-faint text-xs transition group-hover:opacity-90",
            isCredit
              ? "text-[0.73rem] font-medium sm:text-xs"
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
          "theme-external-link-badge-icon shrink-0",
          isCredit ? "mb-0.5 ml-1.5 inline-block align-middle" : "-ml-1",
        )}
      />
    </div>
  );
}
