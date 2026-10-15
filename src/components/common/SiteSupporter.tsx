"use client";

import { SITE_FLAVOR_CONFIG, type SiteFlavorConfig } from "@/config/siteFlavor";
import { useT } from "@/i18n/client";

interface SiteSupporterProps {
  align?: "start" | "center" | "end";
  className?: string;
  config?: SiteFlavorConfig;
  markHeightRem?: number;
}

export function SiteSupporter({
  align = "start",
  className,
  config = SITE_FLAVOR_CONFIG,
  markHeightRem = 1.5,
}: SiteSupporterProps) {
  const t = useT();
  const supporter = config.footer.supporter;

  if (!supporter) {
    return null;
  }

  return (
    <a
      href={supporter.href}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        "theme-site-supporter inline-flex w-fit flex-col gap-1.5",
        align === "center" ? "items-center" : align === "end" ? "items-end" : "items-start",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="theme-site-supporter-label">{t(supporter.prefix)}</span>
      <span
        role="img"
        aria-label={supporter.alt}
        className="theme-site-supporter-mark"
        style={{
          height: `${markHeightRem}rem`,
          aspectRatio: supporter.markAspectRatio,
          WebkitMaskImage: `url(${supporter.markPath})`,
          maskImage: `url(${supporter.markPath})`,
        }}
      />
    </a>
  );
}
