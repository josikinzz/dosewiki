"use client";

/**
 * The pre-release version pill that accompanies the brand lockups while the site is in
 * beta. It is deliberately not part of {@link SiteWordmark}: the wordmark's two runs must
 * rejoin into the flavor's display name, and the badge is release metadata, not brand.
 *
 * Two variants, one per surface:
 * - `hero` renders the pill sized for the homepage wordmark; the call site raises it
 *   into a superscript beside the h1 without joining the heading's layout flow. Below
 *   md the stage word drops and only the version shows: the superscript hangs off the
 *   wordmark's end, and at phone widths the full pill rides the viewport edge (and
 *   overflows it on the About heading). The accessible name keeps the stage.
 * - `header` renders the same text as a micro-pill next to the header brand. It stays
 *   visible on mobile after the wordmark hides, so the beta mark never disappears.
 *
 * A flavor without a `versionBadge` (Effect Index) renders nothing, so removal at 1.0 is
 * a one-line config change.
 */
import { SITE_FLAVOR_CONFIG, type SiteFlavorConfig } from "@/config/siteFlavor";
import { useT } from "@/i18n/client";

interface SiteVersionBadgeProps {
  variant: "hero" | "header" | "logoOverlay";
  /** Injected for tests; defaults to the ambient build-time flavor. */
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
    // Mobile header treatment: no pill at all — the version sits centered inside the
    // hexagon ring of the 40px logo. The call site provides the `relative` logo span.
    // Hidden from xl up, where the header pill under the wordmark takes over.
    // The -0.5px shifts are deliberate: the mark's protruding molecule dots pad the
    // viewBox asymmetrically (hole ~0.5px left of box center, measured from the
    // rasterized mask), and the glyph ink rides ~0.5px low in its line box.
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
    // Decorative on purpose: the badge sits inside the brand link, and an aria-label
    // here would leak into the link's accessible name. The beta status is announced
    // by the page title and the hero badge instead. Hidden below xl, where the
    // logo-overlay variant carries the version; from xl it sits under the wordmark,
    // compact enough that the brand column never outgrows the header row.
    return (
      <span
        aria-hidden="true"
        className="theme-accent-heading hidden items-center font-display text-[9px] font-semibold uppercase leading-none tracking-widest xl:inline-flex"
      >
        {badge.version} {t(badge.label)}
      </span>
    );
  }

  return (
    <span
      aria-label={accessibleName}
      className="theme-accent-heading inline-flex items-center font-display text-xs font-semibold uppercase leading-none tracking-[0.2em]"
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
