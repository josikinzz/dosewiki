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
  ...props
}: ExternalSourcePillProps) {
  const fallbackAriaLabel =
    typeof prefix === "string" && typeof label === "string"
      ? `${prefix} ${label}`
      : undefined;

  return (
    <div
      className={cn(
        "theme-external-source-pill group relative flex items-center gap-2.5 rounded-full px-3 py-1.5 pr-4 ring-1 transition",
        className,
      )}
      {...props}
    >
      {href ? (
        <a
          href={href}
          target={target}
          rel={rel}
          aria-label={ariaLabel ?? fallbackAriaLabel}
          className="absolute inset-0 z-10 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
        />
      ) : null}
      <span className="theme-text-faint text-xs transition group-hover:opacity-90">
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
      <span className="-ml-1 text-xs font-semibold text-current transition">
        {label}
      </span>
      {suffix ? (
        <span className="theme-text-faint -ml-1 text-xs transition group-hover:opacity-90">
          {suffix}
        </span>
      ) : null}
      <Icon
        icon="lucide:external-link"
        size={12}
        className="theme-external-link-badge-icon -ml-1 shrink-0 text-current opacity-60 transition group-hover:opacity-90"
      />
    </div>
  );
}
