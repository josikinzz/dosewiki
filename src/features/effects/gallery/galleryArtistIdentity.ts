import type { PublicGalleryReplicationPreview } from "@/types/replications";
import { hasKnownCreator } from "../components/replicationCredit";
import { UNATTRIBUTED_LABEL } from "@/features/replications/replicationVocabulary";
import type { GalleryGroup, GalleryMode } from "./galleryTypes";

export const UNATTRIBUTED_KEY = "__unattributed__";
export const UNKNOWN_ARTIST_URL_KEY = "unknown";

export function isDisplayable(replication: Pick<PublicGalleryReplicationPreview, "url">): boolean {
  return Boolean(replication.url);
}

export const ARTIST_VIEW_WITHHELD_EFFECT_SLUGS: ReadonlySet<string> = new Set([
  "unspeakable-horrors",
]);

export function isWithheldFromArtistViews(
  replication: Pick<PublicGalleryReplicationPreview, "effect_slug">,
): boolean {
  const slug = replication.effect_slug;
  return slug !== undefined && ARTIST_VIEW_WITHHELD_EFFECT_SLUGS.has(slug);
}

export function artistIdentity(artist?: string | null): {
  key: string;
  label: string;
} {
  if (!hasKnownCreator(artist)) {
    return { key: UNATTRIBUTED_KEY, label: UNATTRIBUTED_LABEL };
  }
  const label = artist!.trim();
  return { key: label.toLowerCase(), label };
}

function slugifyArtistLabel(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stableKeyHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

export function artistUrlKeyFromIdentity(key: string, label: string): string {
  if (key === UNATTRIBUTED_KEY) {
    return UNKNOWN_ARTIST_URL_KEY;
  }
  const slug = slugifyArtistLabel(label);
  if (!slug || slug === UNKNOWN_ARTIST_URL_KEY) {
    return `${UNKNOWN_ARTIST_URL_KEY}-${stableKeyHash(key)}`;
  }
  return slug;
}

export function artistUrlKey(artist?: string | null): string {
  const { key, label } = artistIdentity(artist);
  return artistUrlKeyFromIdentity(key, label);
}

export function galleryGroupUrlKey(
  mode: GalleryMode,
  group: Pick<GalleryGroup, "key" | "label">,
): string {
  if (mode === "effect") {
    return group.key;
  }
  return artistUrlKeyFromIdentity(group.key, group.label);
}

export function effectNameLookup(
  effects: readonly { slug: string; name: string }[],
): (slug: string | undefined) => string {
  const map = new Map(effects.map((effect) => [effect.slug, effect.name]));
  return (slug: string | undefined) =>
    slug ? (map.get(slug) ?? slug.replace(/-/g, " ")) : "";
}

export function effectHrefBuilder(
  prefix = "/effects",
  linkableEffectSlugs?: ReadonlySet<string>,
): (slug: string) => string | undefined {
  const base = (prefix || "/effects").replace(/\/$/, "");
  return (slug: string) =>
    !linkableEffectSlugs || linkableEffectSlugs.has(slug)
      ? `${base}/${slug}`
      : undefined;
}
