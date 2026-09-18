"use client";

/**
 * Drug-class safety banners as they appear on a public substance article.
 *
 * This component makes no decision about *whether* a banner belongs here. It is
 * handed an already-filtered, already-capped list; `resolveEnabledBanners` in
 * `src/data/substanceWarningBanners.ts` is the only place that decision is made,
 * and it takes a slug rather than a classification by construction — so there is
 * no path from "this substance is a benzodiazepine" to a rendered warning. An
 * editor enables a preset on a named slug in `/dev/banners` or nothing renders.
 * The route loader (`lib/next/routeLoaders.tsx`) resolves the list; the cap
 * (`MAX_BANNERS_PER_ARTICLE`) is already applied by the time it reaches here.
 */

// Direct module import, not the `@/components/ui` barrel. The barrel re-exports
// every primitive, and several of them read `RadixPrimitive.X.displayName` at
// module scope (`command.tsx`, `select.tsx`, `dialog.tsx`, …). Pulling those into
// the `/[slug]` server chain breaks `next build` at page-data collection with
// "Cannot read properties of undefined (reading 'displayName')". Direct imports
// are also what the rest of `src` does — 339 of them against 11 barrel imports.
import {
  SafetyBanner,
  SafetyBannerPoints,
  SafetyBannerTitle,
} from "@/components/ui/safety-banner";
import { cn } from "@/lib/utils";
import type { WarningBannerPreset } from "@/data/substanceWarningBanners";
import { useT } from "@/i18n/client";

export interface SubstanceWarningBannersProps {
  banners: WarningBannerPreset[];
  /**
   * The site-wide glyph size from the `safety-banner-display` siteConfig
   * document, read by `getSafetyBannerIconSize` in `lib/next/warningBanners.ts`
   * and threaded down the route loader. Every banner on the page gets the same
   * number — it is one editor setting, not a per-preset field. Absent falls
   * back to `SAFETY_BANNER_ICON_SIZE_DEFAULT` inside `SafetyBanner`.
   */
  iconSize?: number;
  className?: string;
}

export function SubstanceWarningBanners({
  banners,
  iconSize,
  className,
}: SubstanceWarningBannersProps) {
  const t = useT();
  // The overwhelmingly common case: no preset is enabled on this slug. Bail
  // before emitting anything at all — an empty wrapper would still be a flex
  // child of StickyTocLayout's `gap-8` content column and would open a visible
  // gap above the hero on every unbannered article.
  if (banners.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {banners.map((preset) => (
        <SafetyBanner
          key={preset.key}
          variant={preset.tone}
          icon={preset.icon}
          iconSize={iconSize}
        >
          <SafetyBannerTitle severityLabel={t(preset.severityLabel)} tone={preset.tone}>
            {t(preset.headline)}
          </SafetyBannerTitle>
          {/* Every visible string here is a stored, editor-authored field. The
              mechanism text is `points` and nothing else: a line is a paragraph
              unless the editor opened it with a markdown list marker, so bullets
              are something they ask for rather than a shape imposed on them. */}
          <SafetyBannerPoints points={preset.points.map((point) => t(point))} />
        </SafetyBanner>
      ))}
    </div>
  );
}
