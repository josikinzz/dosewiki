import { isEffectIndex } from "@/config/siteFlavor";
import manifest from "../entitySocialCardManifest.generated.json";

export const ENTITY_SOCIAL_CARD_SIZE = 1200;

export type EntitySocialCardKind = keyof typeof manifest.cards;

export function entitySocialCardUrl(
  kind: EntitySocialCardKind,
  slug: string,
): string | null {
  if (isEffectIndex()) return null;
  const normalizedSlug = slug.trim().toLowerCase();
  return manifest.cards[kind][
    normalizedSlug as keyof (typeof manifest.cards)[typeof kind]
  ] ?? null;
}

export function entitySocialCardImage(
  kind: EntitySocialCardKind,
  slug: string,
  alt: string,
) {
  const cardUrl = entitySocialCardUrl(kind, slug);
  return cardUrl
    ? {
        path: cardUrl,
        width: ENTITY_SOCIAL_CARD_SIZE,
        height: ENTITY_SOCIAL_CARD_SIZE,
        alt,
      }
    : undefined;
}

type ReplicationViewerSearchParams = {
  viewer?: string | string[];
};

/**
 * Resolve the active immersive-view work to its immutable replication card.
 * Duplicate or unknown viewer values fail closed so the host page keeps its
 * normal social image.
 */
export function replicationViewerSocialCardImage(
  searchParams: ReplicationViewerSearchParams,
) {
  const viewerSlug = searchParams.viewer;
  return typeof viewerSlug === "string"
    ? entitySocialCardImage(
        "replications",
        viewerSlug,
        "Linked replication card",
      )
    : undefined;
}
