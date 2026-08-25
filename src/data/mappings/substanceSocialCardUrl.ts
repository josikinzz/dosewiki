import manifest from "../substanceSocialCardManifest.generated.json";

export const SUBSTANCE_SOCIAL_CARD_SIZE = 1200;

const CARD_PATH_BY_SLUG: Readonly<Record<string, string>> = manifest.cards;

/** Build-generated social card path for a canonical substance slug. */
export function substanceSocialCardUrl(slug: string): string | null {
  return CARD_PATH_BY_SLUG[slug] ?? null;
}
