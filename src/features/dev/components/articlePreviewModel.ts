/**
 * Pure rules behind `ArticlePreviewFrame`: where a draft banner lands in an
 * article's stack, and how an unsaved depiction becomes an image source.
 */
import {
  CITATION_OVERHAUL_BANNER_KEY_PREFIX,
  presetAppliesToSlug,
  resolveArticleBanners,
  type WarningBannerPreset,
} from "@/data/substanceWarningBanners";
import { applyMoleculeColorway } from "@/data/mappings/moleculePalette";
import type { ColorScheme } from "@/theme";

export type PreviewBannerStack = {
  /** The stack in render order, capped, with the draft in place of its saved copy. */
  banners: WarningBannerPreset[];
  /**
   * Why readers would not see the draft here, or null when it is in the stack:
   * `cap` when enough higher-ranked banners fill the per-article limit,
   * `audited` when the beta disclaimer replaces citation-overhaul presets.
   */
  hiddenBy: "cap" | "audited" | null;
  /**
   * True when the draft is not live on this slug (off, dormant, or not on its
   * list) and is shown here as if it were, so the admin can still see it.
   */
  forced: boolean;
};

/**
 * The draft replaces its saved copy (same key) among every other stored
 * preset, then the route's own rule orders and caps the stack. A draft that
 * would not render on this slug is treated as enabled here for the preview,
 * and says so through `forced`.
 */
export function previewBannerStack({
  presets,
  draft,
  slug,
  showBetaDisclaimer,
}: {
  presets: readonly WarningBannerPreset[];
  draft: WarningBannerPreset;
  slug: string;
  showBetaDisclaimer: boolean;
}): PreviewBannerStack {
  const forced = !presetAppliesToSlug(draft, slug);
  const previewDraft: WarningBannerPreset = forced
    ? { ...draft, enabled: true, allSubstances: false, enabledSlugs: [slug.trim().toLowerCase()] }
    : draft;
  const others = presets.filter((preset) => preset.key !== draft.key);
  const banners = resolveArticleBanners([...others, previewDraft], slug, { showBetaDisclaimer });
  const hiddenBy = banners.includes(previewDraft)
    ? null
    : showBetaDisclaimer && draft.key.startsWith(CITATION_OVERHAUL_BANNER_KEY_PREFIX)
      ? "audited"
      : "cap";
  return { banners, hiddenBy, forced };
}

/**
 * An unsaved depiction as an image source in the frame's colour scheme. The
 * image route recolours saved bytes per scheme at serve time; this applies the
 * same colourway to the draft bytes, so the preview matches what the route
 * will serve once saved.
 */
export function draftMoleculeImageUrl(svg: string, scheme: ColorScheme): string {
  const bytes = applyMoleculeColorway(svg, scheme === "light" ? "pro-light" : "pro-dark");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(bytes)}`;
}
