import {
  CITATION_OVERHAUL_BANNER_KEY_PREFIX,
  presetAppliesToSlug,
  resolveArticleBanners,
  type WarningBannerPreset,
} from "@/data/substanceWarningBanners";
import { applyMoleculeColorway } from "@/data/mappings/moleculePalette";
import type { ColorScheme } from "@/theme";

export type PreviewBannerStack = {
  banners: WarningBannerPreset[];
  hiddenBy: "cap" | "audited" | null;
  forced: boolean;
};

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

export function draftMoleculeImageUrl(svg: string, scheme: ColorScheme): string {
  const bytes = applyMoleculeColorway(svg, scheme === "light" ? "pro-light" : "pro-dark");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(bytes)}`;
}
