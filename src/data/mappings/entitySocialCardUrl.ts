import manifest from "../entitySocialCardManifest.generated.json";

const ENTITY_SOCIAL_CARD_SIZE = 1200

export type EntitySocialCardKind = keyof typeof manifest.cards;

export function entitySocialCardUrl(
  kind: EntitySocialCardKind,
  slug: string,
): string | null {
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

/**
 * Resolve an immersive-view deep link's work to its immutable replication
 * card. Unknown slugs fail closed so the host page keeps its normal social
 * image.
 */
export function replicationViewerSocialCardImage(viewerSlug: string) {
  return entitySocialCardImage(
    "replications",
    viewerSlug,
    "Linked replication card",
  );
}
