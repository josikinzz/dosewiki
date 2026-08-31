/**
 * The pre-release version pill that accompanies the brand lockups while the site is in
 * beta. It is deliberately not part of {@link SiteWordmark}: the wordmark's two runs must
 * rejoin into the flavor's display name, and the badge is release metadata, not brand.
 *
 * Two variants, one per surface:
 * - `hero` renders the pill sized for the homepage wordmark; the call site raises it
 *   into a superscript beside the h1 without joining the heading's layout flow.
 * - `header` renders the same text as a micro-pill next to the header brand. It stays
 *   visible on mobile after the wordmark hides, so the beta mark never disappears.
 *
 * A flavor without a `versionBadge` (Effect Index) renders nothing, so removal at 1.0 is
 * a one-line config change.
 */
import { SITE_FLAVOR_CONFIG, type SiteFlavorConfig } from "@/config/siteFlavor";

interface SiteVersionBadgeProps {
  variant: "hero" | "header";
  /** Injected for tests; defaults to the ambient build-time flavor. */
  config?: SiteFlavorConfig;
}

export function SiteVersionBadge({
  variant,
  config = SITE_FLAVOR_CONFIG,
}: SiteVersionBadgeProps) {
  const badge = config.versionBadge;
  if (!badge) return null;

  const accessibleName = `version ${badge.version.replace(/^v/, "")} ${badge.label}`;

  if (variant === "header") {
    // Decorative on purpose: the badge sits inside the brand link, and an aria-label
    // here would leak into the link's accessible name. The beta status is announced
    // by the page title and the hero badge instead.
    // Below xl the wordmark is hidden and space is tight, so the pill compacts to the
    // version alone at 9px; from xl it grows back to the full "v0.9 beta" at 10px.
    return (
      <span
        aria-hidden="true"
        className="theme-accent-heading ml-1 inline-flex items-center self-start rounded-full border border-current/35 px-1 pt-[1.5px] pb-[3px] font-display text-[9px] font-semibold uppercase leading-none tracking-wider xl:ml-1.5 xl:px-1.5 xl:pt-[2px] xl:pb-[4px] xl:text-[10px] xl:tracking-widest"
      >
        <span className="xl:hidden">{badge.version}</span>
        <span className="hidden xl:inline">{`${badge.version} ${badge.label}`}</span>
      </span>
    );
  }

  return (
    <span
      aria-label={accessibleName}
      className="theme-accent-heading inline-flex items-center rounded-full border border-current/35 px-2.5 py-[5px] font-display text-xs font-semibold uppercase leading-none tracking-[0.2em]"
    >
      <span aria-hidden="true">{`${badge.version} ${badge.label}`}</span>
    </span>
  );
}
