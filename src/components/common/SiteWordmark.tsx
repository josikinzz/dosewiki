import { SITE_FLAVOR_CONFIG, type SiteFlavorConfig } from "@/config/siteFlavor";

interface SiteWordmarkProps {
  accentClassName?: string;
  config?: SiteFlavorConfig;
}

export function SiteWordmark({
  accentClassName = "theme-accent-heading",
  config = SITE_FLAVOR_CONFIG,
}: SiteWordmarkProps) {
  const hasSeparator = /\s$/.test(config.wordmark.lead);
  const lead = hasSeparator ? config.wordmark.lead.trimEnd() : config.wordmark.lead;
  return (
    <>
      {lead}
      {hasSeparator ? "\u00a0" : null}
      <span className={accentClassName}>{config.wordmark.accent}</span>
    </>
  );
}
