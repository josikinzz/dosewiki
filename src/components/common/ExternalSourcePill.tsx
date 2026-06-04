import type { ComponentPropsWithoutRef } from "react";
import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

export type ExternalSourcePillProps = Omit<
  ComponentPropsWithoutRef<"a">,
  "children"
> & {
  label: string;
  prefix?: string;
  faviconSrc?: string;
  faviconAlt?: string;
};

export function ExternalSourcePill({
  label,
  prefix = "Powered by",
  faviconSrc,
  faviconAlt = "",
  className,
  target = "_blank",
  rel = "noopener noreferrer",
  ...props
}: ExternalSourcePillProps) {
  return (
    <a
      target={target}
      rel={rel}
      aria-label={`${prefix} ${label}`}
      className={cn(
        "theme-external-source-pill theme-evidence-surface group relative flex items-center gap-2.5 rounded-full px-3 py-1.5 pr-4 ring-1 transition",
        className,
      )}
      {...props}
    >
      <span className="theme-text-faint text-xs transition group-hover:text-[var(--theme-text-secondary)]">
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
      <span className="theme-evidence-accent -ml-1 text-xs font-semibold transition group-hover:text-[var(--theme-evidence-text)]">
        {label}
      </span>
      <Icon
        icon="lucide:external-link"
        size={12}
        className="theme-external-link-badge-icon theme-evidence-accent -ml-1 opacity-60 transition group-hover:opacity-90"
      />
    </a>
  );
}
