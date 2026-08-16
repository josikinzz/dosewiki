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
  SafetyBannerLinks,
  SafetyBannerPoints,
  SafetyBannerTitle,
} from "@/components/ui/safety-banner";
import { cn } from "@/lib/utils";
import type { WarningBannerPreset } from "@/data/substanceWarningBanners";

export interface SubstanceWarningBannersProps {
  banners: WarningBannerPreset[];
  className?: string;
}

export function SubstanceWarningBanners({ banners, className }: SubstanceWarningBannersProps) {
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
          severityLabel={preset.severityLabel}
        >
          <SafetyBannerTitle>{preset.headline}</SafetyBannerTitle>
          <SafetyBannerPoints points={preset.points} />
          {/* Every visible string here is a stored, editor-authored field —
              including each chip's text, which is `link.label` and never a
              lookup keyed on `sectionId`. Deriving chip wording in code was the
              first contract and was rejected: it made the one part of the banner
              an editor most needs to reword the one part they could not.
              Presets carry links at all because a warning that only says "this
              is dangerous" is a dead end; the chips hand the reader the section
              that explains it. */}
          <SafetyBannerLinks links={preset.links} />
        </SafetyBanner>
      ))}
    </div>
  );
}

export default SubstanceWarningBanners;
