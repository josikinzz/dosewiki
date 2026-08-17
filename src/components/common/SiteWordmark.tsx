/**
 * The site wordmark, rendered as a lead run plus an accented run.
 *
 * Every chrome surface (header, footer, homepage hero, construction-mode header, the
 * under-construction page) drew this inline as `dose<span>.wiki</span>`. That structure is
 * not a string, so it cannot be flavored by swapping a literal — hence this component.
 * The rendered node order is identical to the markup it replaces, so the dose.wiki flavor
 * emits exactly the same HTML as before.
 */
import { SITE_FLAVOR_CONFIG, type SiteFlavorConfig } from "@/config/siteFlavor";

interface SiteWordmarkProps {
  /** Classes for the accented run. Defaults to the shared heading-accent token. */
  accentClassName?: string;
  /** Injected for tests; defaults to the ambient build-time flavor. */
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
