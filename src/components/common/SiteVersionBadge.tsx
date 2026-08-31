/**
 * The pre-release version pill that accompanies the brand lockups while the site is in
 * beta. It is deliberately not part of {@link SiteWordmark}: the wordmark's two runs must
 * rejoin into the flavor's display name, and the badge is release metadata, not brand.
 *
 * Two variants, one per surface:
 * - `hero` renders the full "v0.9 beta" pill under the homepage wordmark.
 * - `header` renders only the stage word ("beta") as a micro-pill riding the cap height
 *   of the header wordmark, where the version number would be noise at that size.
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
    return (
      <span
        aria-hidden="true"
        className="theme-accent-heading ml-1.5 inline-flex self-start rounded-full border border-current/35 px-1.5 py-px font-display text-[10px] font-semibold uppercase leading-4 tracking-widest"
      >
        {badge.label}
      </span>
    );
  }

  return (
    <span
      aria-label={accessibleName}
      className="theme-accent-heading inline-flex items-center rounded-full border border-current/35 px-2.5 py-0.5 font-display text-xs font-semibold uppercase tracking-[0.2em]"
    >
      <span aria-hidden="true">{`${badge.version} ${badge.label}`}</span>
    </span>
  );
}
