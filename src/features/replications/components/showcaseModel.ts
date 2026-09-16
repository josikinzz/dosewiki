import {
  getCreatorByline,
  hasKnownCreator,
} from "@/features/effects/components/replicationCredit";
import { artistPageHrefForWork } from "@/features/replications/galleryFocus";
import type { SubstanceGalleryItem } from "@/data/substanceReplicationGallery";
import {
  resolveVisualEffectSlugs,
  visualEffectNamesOf,
} from "@/data/substanceVisualEffects";
import {
  isVisualReplication,
  type ReplicationWithUrl,
} from "@/types/replications";
import { applyCuratedOrder } from "@server/curatedOrder";

import type { ShowcaseWork } from "./showcaseWork";

// Exact reviewed content tags, not words inferred from titles or artist names.
// The public corpus includes these on dark-surrealist works, including
// morbid-mandala-sunterry-art (geometry, body-horror, grotesque-mandala).
const UNSETTLING_CONTENT_TAGS: Readonly<Record<string, true | undefined>> = {
  "horror-surrealism": true,
  "horror-fantasy": true,
  "fantasy-horror": true,
  "cosmic-horror": true,
  "biomechanical-horror": true,
  "body-horror": true,
  grotesque: true,
  "grotesque-mandala": true,
};

// Editorial opening deferrals, bound to the inspected immutable media rather
// than a title classifier. Distributed frames reviewed 2026-09-07:
// - OEV simulation: dim mottled room and indistinct hallucinations throughout.
// - CEV/cognitive delirium: saturated/glitchy room, sharp red frames and street.
// - Hat Man: looming multi-armed dark figure with bright eyes.
// - Bad Trip: dark olive walkway and heavy peripheral shadow distortions.
// - Minions: film segment transitioning to bright pink repeating cartoon faces.
// - 700 Club: all sampled frames show a static title card, not a visual scene.
// - Spiders: dim dark bedroom with spider-hallucination overlays.
// Deferral also covers less suitable introductions, not just unsettling work.
// These remain public works; no taxonomy, drug association or membership changes.
const DEFERRED_OPENING_ASSETS: Readonly<Record<string, string | undefined>> = {
  "deliriant-dph-benadryl-datura-dramamine-oev-auditory-replication-simulation-hd":
    "media/sha256/62/6263d0735f6996d90a8cd5355f5c8a8eb51f626d70345635b1a50abfd5a76d63.mp4",
  "you-told-me-this-was-going-to-be-fun-delirant-replication-cevs-cognitive-delir":
    "media/sha256/fe/fe922cd86cac2e2d914c6e9a7cb6ab21ceae5bd1b549b4644877e6765d89f4ca.mp4",
  "the-hat-man":
    "media/sha256/7a/7a17ecfd7a24dbfa4a0e0e03beafd264a04c256ef1578bdda6f6a94bfa386432.webp",
  "bad-trip-symmetric-vision":
    "media/sha256/df/df875c834c774360e7ce1d814bc56829540c771f62008bf0dbefbe12cf75a805.mp4",
  "i-mean-illumination-s-minions-and-more-xs395k":
    "media/sha256/57/57a59f6e8d5ed86f4c9d52b3548921af66f5c3a621ede5468380cbd1d2e67c98.mp4",
  "deliriant-dph-datura-replication-visual-audio-the-700-club-stas-constantine-st":
    "media/sha256/55/55ce32a380fea10621c16b05a012aa78d4ef9e4d8e0f47aded552befecfed1cc.mp4",
  "spiders-delirium-replication-feetman100":
    "media/sha256/eb/eb0d239e1146832837f7ae061d0b4afa78960089fea8231a0177be1df10f5994.mp4",
};

const UNSETTLING_EFFECTS: Readonly<Record<string, true | undefined>> = {
  "unspeakable-horrors": true,
  "shadow-people": true,
};

// Positive opening curation after the stored editor order, using the same
// partial-order contract. Full-span distributed video frames and full images
// reviewed 2026-09-07. Bind each choice to its immutable inspected asset;
// inclusion still comes exclusively from the collection's existing members.
const REVIEWED_EFFECT_OPENINGS: Readonly<
  Record<string, readonly { slug: string; r2Key: string }[] | undefined>
> = {
  "visual-haze": [
    {
      // Sunlit, misty green forest throughout the 30-second 720p sequence.
      slug: "in-the-forest-on-lsd-g6wndv",
      r2Key: "media/sha256/05/05f8a8853b8a2793c461da453563a5146be08e2e4dd63c973b2f4d5252dbf0a7.mp4",
    },
    {
      // Forest substrate persists beneath sun flare and chromatic haze, 1080p.
      slug: "staring-at-the-sun-on-psychedelics-6e00jy",
      r2Key: "media/sha256/42/423ba25170973ad1d137bc9b402196f6997eba191d24e847062e47e5377a8d90.mp4",
    },
    {
      // Moon and clouds remain the focus through a 12-second haze cycle, 720p.
      slug: "spacing-out-at-the-moon-on-psychedelics-6rf7t2",
      r2Key: "media/sha256/cf/cfe749ebc9bb6d529cd2816401cdc18cfedc798e02d42e407ef7f50ec41e85ec.mp4",
    },
  ],
  "scenarios-and-plots": [
    {
      // Coherent painterly room, cafe and river transitions. Only 480px, but a
      // more welcoming scene demonstration than the uncurated movie excerpts.
      slug: "switching-setting-ebeuw0",
      r2Key: "media/sha256/d9/d990e2da81b8e32a4cbb3d10153fd8aa00671e4fc232ef20d583c99385635428.mp4",
    },
    {
      // Mountain landscape with pink/blue sky patterning, inspected full-size.
      slug: "acid-sunset-76rqzn",
      r2Key: "media/sha256/3b/3b2b1e34fb6f9a863a058faacf375db44624b7c138d0f185204d93b6a5e23bbf.webp",
    },
  ],
};

// The same inspected works can open a substance playlist when already present.
// This lookup never creates a drug association or imports an effect's members.
const REVIEWED_OPENING_ASSETS: Readonly<Record<string, string | undefined>> = {
  ...Object.fromEntries(
    Object.values(REVIEWED_EFFECT_OPENINGS).flatMap((openings) =>
      (openings ?? []).map(({ slug, r2Key }) => [slug, r2Key]),
    ),
  ),
  // Full-span frames reviewed 2026-09-07: a pale textured field with subdued
  // shifting noise (6s, 720x794), rather than figures or spider imagery.
  "hppd-1-mostly-from-deliriants-1t5nsod":
    "media/sha256/95/953eeaf03e26c1b59edfc843fcac745b5f5929dd680fc79d51816f0303341e6e.mp4",
  // Plain warm wall with subtle texture movement (2s, 720x960). A quiet
  // demonstration, not a claim of cinematic quality or substance safety.
  "walls-on-dph-1sby3xs":
    "media/sha256/71/71aab1230d0544d491a73933969c98ec6df71703e1a14ab43291a63866203d79.mp4",
};

/**
 * Presentation preference, not a safety or artistic-quality certification.
 * Known unsettling content follows every other work, even if editorially
 * pinned or open-eye. Within that boundary, explicit editorial pins precede
 * automatic preferences. Otherwise keep the substance fallback at the end,
 * prefer confirmed open-eye scenes, then video and other motion. Neither audio
 * nor AI origin is evidence of quality. Unknown taxonomy stays visible without
 * a safe label.
 */
function showcaseOpeningRank(
  replication: ReplicationWithUrl,
  visualDisconnectionFallback = false,
  editoriallyPinned = false,
  preferReviewedOpening = false,
): number {
  const deferredAsset = DEFERRED_OPENING_ASSETS[replication.slug];
  if (deferredAsset !== undefined && replication.r2_key === deferredAsset) return 200;
  const unsettling =
    replication.content_family === "dark-surrealism" ||
    UNSETTLING_EFFECTS[replication.effect_slug ?? ""] === true ||
    replication.effect_tags?.some((slug) => UNSETTLING_EFFECTS[slug] === true) === true ||
    replication.content_tags?.some((tag) => UNSETTLING_CONTENT_TAGS[tag] === true) === true;
  // Within inherently unsettling collections, retain editorial judgment rather
  // than promoting a more intense video merely because it is open-eye.
  if (unsettling) return 100;
  if (editoriallyPinned) return 0;
  const reviewedAsset = REVIEWED_OPENING_ASSETS[replication.slug];
  if (
    preferReviewedOpening &&
    reviewedAsset !== undefined &&
    replication.r2_key === reviewedAsset
  ) return 1;
  const openEye =
    replication.viewing_mode === "open-eye" ||
    (replication.viewing_mode == null &&
      replication.viewing_mode_tags?.length === 1 &&
      replication.viewing_mode_tags[0] === "open-eye");
  const motionRank =
    replication.type === "video"
      ? 0
      : replication.format?.toLowerCase() === "gif"
        ? 1
        : 2;
  return (
    2 +
    (visualDisconnectionFallback ? 20 : 0) +
    (openEye ? 0 : 4) +
    motionRank
  );
}

/**
 * Effect slug → display name, derived from the article's own visual-effect
 * chips. The matcher resolved these exact names to slugs (T1), so inverting
 * that resolution names each provenance slug with the same words the reader
 * just scrolled past — not a re-derived label that could disagree with the
 * chips. First name wins when two chips resolve to one effect.
 */
export function visualEffectNameBySlug(
  subjectiveEffects: unknown,
): ReadonlyMap<string, string> {
  const names = visualEffectNamesOf(subjectiveEffects);
  const { slugByName } = resolveVisualEffectSlugs(names);
  const bySlug = new Map<string, string>();
  for (const [name, slug] of slugByName) {
    if (!bySlug.has(slug)) bySlug.set(slug, name);
  }
  return bySlug;
}

/**
 * Flatten the public per-substance read into stage-ready works. Stored editorial
 * order is authoritative; unlisted works retain the automatic opening policy.
 * Rows the stage cannot draw (audio) drop out; unknown effect names use the
 * gallery's humanised-slug convention.
 */
export function buildShowcaseWorks(
  items: readonly SubstanceGalleryItem[],
  effectNameBySlug: ReadonlyMap<string, string>,
  resolveArtistFallbackHref: (artistName: string) => string | null = () => null,
  resolveArtistAvatarUrl: (artistName: string) => string | null = () => null,
  carouselOrder?: readonly string[],
): ShowcaseWork[] {
  const works: ShowcaseWork[] = [];
  const ranked = items
    .map((item) => ({
      item,
      rank: showcaseOpeningRank(
        item.replication,
        item.provenance.matchedVia === "visual_disconnection",
        false,
        true,
      ),
    }))
    .sort((left, right) => left.rank - right.rank);
  const ordered = carouselOrder?.length
    ? applyCuratedOrder(ranked, carouselOrder, ({ item }) => item.replication.slug)
    : ranked;
  for (const { item: { replication, provenance } } of ordered) {
    if (!isVisualReplication(replication)) continue;
    const artistName = hasKnownCreator(replication.artist)
      ? replication.artist.trim()
      : null;
    const internalHref =
      artistPageHrefForWork(replication) ??
      (artistName ? resolveArtistFallbackHref(artistName) : null);
    const artistHref =
      internalHref ??
      (artistName ? replication.artist_url?.trim() || null : null);
    works.push({
      slug: replication.slug,
      title: replication.title,
      type: replication.type,
      url: replication.url,
      thumbnailUrl: replication.thumbnail_url,
      format: replication.format,
      duration: replication.duration,
      hasAudio: replication.has_audio,
      width: replication.width,
      height: replication.height,
      previewUrl: replication.preview_url,
      motionUrl: replication.motion_url,
      motionPosterUrl: replication.motion_poster_url,
      byline: getCreatorByline(replication),
      artistName,
      artistHref,
      artistHrefExternal: artistHref !== null && internalHref === null,
      avatarUrl: artistName ? resolveArtistAvatarUrl(artistName) : null,
      effectSlug: provenance.effectSlug,
      effectName:
        effectNameBySlug.get(provenance.effectSlug) ??
        provenance.effectSlug.replace(/-/g, " "),
    });
  }
  return works;
}

/**
 * Flatten an effect's public replication rows into stage-ready works. Apply
 * the automatic opening policy, then the editor's authoritative stored order.
 * Automatic reviewed openings remain preferences, not overrides of saved pins.
 * No members are removed by the opening policy.
 * The effect path deliberately performs no contributor-profile fallback or
 * avatar lookup — parity with the client gallery it replaced: a byline links
 * the Artist Page when the work proves one exists, else the credit's own
 * site, else nowhere.
 */
export function buildEffectShowcaseWorks(
  replications: readonly ReplicationWithUrl[],
  opts: {
    effectSlug?: string;
    effectName?: string;
    galleryOrder?: readonly string[];
  } = {},
): ShowcaseWork[] {
  const { effectSlug, effectName, galleryOrder } = opts;
  const curatedOrder = [...(galleryOrder ?? [])];
  for (const opening of REVIEWED_EFFECT_OPENINGS[effectSlug ?? ""] ?? []) {
    if (
      replications.some(
        (replication) =>
          replication.slug === opening.slug &&
          replication.r2_key === opening.r2Key,
      )
    ) {
      curatedOrder.push(opening.slug);
    }
  }
  const editorialPins = new Set(curatedOrder);
  const ordered = applyCuratedOrder(
    replications,
    curatedOrder,
    (replication) => replication.slug,
  )
    .map((replication) => ({
      replication,
      rank: showcaseOpeningRank(
        replication,
        false,
        editorialPins.has(replication.slug),
      ),
    }))
    .sort((left, right) => left.rank - right.rank);
  const editoriallyOrdered = galleryOrder?.length
    ? applyCuratedOrder(ordered, galleryOrder, ({ replication }) => replication.slug)
    : ordered;
  const works: ShowcaseWork[] = [];
  for (const { replication } of editoriallyOrdered) {
    if (!isVisualReplication(replication)) continue;
    const artistName = hasKnownCreator(replication.artist)
      ? replication.artist.trim()
      : null;
    const internalArtistHref = artistPageHrefForWork(replication);
    const artistHref =
      internalArtistHref ??
      (artistName ? replication.artist_url?.trim() || null : null);
    const resolvedEffectSlug = effectSlug ?? replication.effect_slug ?? "";
    works.push({
      slug: replication.slug,
      title: replication.title,
      type: replication.type,
      url: replication.url,
      thumbnailUrl: replication.thumbnail_url,
      format: replication.format,
      duration: replication.duration,
      hasAudio: replication.has_audio,
      width: replication.width,
      height: replication.height,
      previewUrl: replication.preview_url,
      motionUrl: replication.motion_url,
      motionPosterUrl: replication.motion_poster_url,
      byline: getCreatorByline(replication),
      artistName,
      artistHref,
      artistHrefExternal: artistHref !== null && internalArtistHref === null,
      effectSlug: resolvedEffectSlug,
      effectName:
        effectName ?? (resolvedEffectSlug.replace(/-/g, " ") || "Effect"),
    });
  }
  return works;
}
