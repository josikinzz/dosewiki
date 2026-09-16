import "server-only";

import { resolveGalleryFocus } from "@/features/replications/galleryFocus";
import { buildArtistShowcaseGroup } from "@/features/replications/artist/artistPageModel";
import { effectNameLookup } from "@/features/effects/gallery/galleryArtistIdentity";
import { viewerCollectionFromGalleryGroups } from "@/features/replications/viewer/viewerModel";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import { getGalleryBrowseIndex, hydrateGalleryPage } from "./galleryBrowseIndex";
import { getLocalizedEffectNames } from "@server/translation/localizedRecords";

/** The same focused membership and curated ordering as the Artist Page. */
export async function getArtistViewerGroups(key: string, locale: string) {
  const language = locale === "zh-Hans" ? "zh-Hans" : "en";
  // Artist keys and membership are canonical. Resolve the one requested group
  // first; translating the complete gallery cannot change that identity and
  // only delays a direct viewer request.
  const index = await getGalleryBrowseIndex("en");
  const focus = resolveGalleryFocus({ kind: "artist", key }, index.rows, {
    effects: index.effects, contributorDirectory: index.directory,
  });
  if (!focus) return [];
  const items: PublicGalleryReplicationPreview[] = [];
  for (let offset = 0; offset < focus.group.items.length; offset += 64) {
    items.push(...await hydrateGalleryPage(focus.group.items.slice(offset, offset + 64), language));
  }
  const effectSlugs = new Set(
    focus.group.items.flatMap((item) => [
      ...(item.effect_tags ?? []),
      ...(item.effect_slug ? [item.effect_slug] : []),
    ]),
  );
  const canonicalEffects = index.effects.filter((effect) =>
    effectSlugs.has(effect.slug),
  );
  const localizedNames = language === "zh-Hans"
    ? await getLocalizedEffectNames(
        canonicalEffects.map((effect) => effect.name),
        language,
      )
    : null;
  const effects = localizedNames
    ? canonicalEffects.map((effect) => ({
        ...effect,
        name: localizedNames.get(effect.name) ?? effect.name,
      }))
    : canonicalEffects;
  const group = buildArtistShowcaseGroup(items);
  return viewerCollectionFromGalleryGroups(
    [group],
    "effect",
    `/replications/artist/${focus.key}`,
    effectNameLookup(effects),
  ).groups;
}
