"use client";

import { SITE_FLAVOR_CONFIG, type SiteFlavorConfig } from "@/config/siteFlavor";
import { useT } from "@/i18n/client";

interface SiteVersionBadgeProps {
  variant: "hero" | "header" | "logoOverlay";
  config?: SiteFlavorConfig;
}

export function SiteVersionBadge({
  variant,
  config = SITE_FLAVOR_CONFIG,
}: SiteVersionBadgeProps) {
  const t = useT();
  const badge = config.versionBadge;
  if (!badge) return null;

  const accessibleName = t("version {{version}} {{label}}", {
    version: badge.version.replace(/^v/, ""),
    label: t(badge.label),
  });

  if (variant === "logoOverlay") {
    return (
      <span
        aria-hidden="true"
        className="theme-text-faint absolute inset-0 flex -translate-x-[0.5px] -translate-y-[0.5px] items-center justify-center font-display text-[8px] font-medium lowercase leading-none tracking-tight xl:hidden"
      >
        {badge.version}
      </span>
    );
  }

  if (variant === "header") {
    return (
      <span
        aria-hidden="true"
        className="theme-accent-heading hidden items-center font-display text-[9px] font-semibold uppercase leading-none tracking-[var(--type-tracking-label)] xl:inline-flex"
      >
        {badge.version} {t(badge.label)}
      </span>
    );
  }

  return (
    <span
      aria-label={accessibleName}
      className="theme-accent-heading type-meta-label inline-flex items-center font-display"
    >
      <span aria-hidden="true">
        {badge.version}
        <span className="max-md:hidden">
          {" "}
          {t(badge.label)}
        </span>
      </span>
    </span>
  );
}
