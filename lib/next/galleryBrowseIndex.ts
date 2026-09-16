import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getPublicContributorDirectory, getPublicEffects, getPublicGalleryReplications } from "@server/data/publicData";
import { getPublicGalleryReplicationsBySlugs } from "@server/data/publicData.replications";
import { publicDataCache, PUBLIC_DATA_CACHE_REVALIDATE_SECONDS, PUBLIC_DATA_CACHE_TAGS } from "@server/data/publicData.cache";
import { getPostgresClient } from "@server/postgres/runtime/backend";
import { getLocalizedLeaves } from "@server/translation/localizedRecords";
import { localizeRecords } from "@server/translation/liveTranslation";
import { isDisplayable } from "@/features/effects/gallery/galleryArtistIdentity";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import type { ContributorDirectory } from "@server/contributorDirectory";
import { segmentHash } from "../../scripts/translation/segment-manifest.mjs";

interface CanonicalIndex {
  rows: PublicGalleryReplicationPreview[];
  effects: Array<{ slug: string; name: string }>;
  directory: ContributorDirectory;
  translationHashes: string[];
  contentRevision: string;
}
export interface GalleryBrowseIndex extends CanonicalIndex {
  canonical: CanonicalIndex;
  revision: string;
  cacheIdentity: string;
}

const sourceRevision = publicDataCache(async () => randomUUID(), ["public-gallery-index-revision-v1"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.replications, PUBLIC_DATA_CACHE_TAGS.effects, PUBLIC_DATA_CACHE_TAGS.contributors],
});

/** No viewer renditions, dimensions or duration survive in the matching index. */
function membershipRow(row: PublicGalleryReplicationPreview): PublicGalleryReplicationPreview {
  return {
    _id: row._id, slug: row.slug, title: row.title, artist: row.artist, artist_url: row.artist_url,
    type: row.type, format: row.format, effect_slug: row.effect_slug, effect_tags: row.effect_tags,
    viewing_mode_tags: row.viewing_mode_tags, title_drugs: row.title_drugs, drug_classes: row.drug_classes,
    content_family: row.content_family, artist_type_tags: row.artist_type_tags, url: row.url,
    has_audio: row.has_audio, created_at: row.created_at, date_info: row.date_info, effect_order_index: row.effect_order_index,
  };
}

async function buildCanonicalIndex(): Promise<CanonicalIndex> {
  const [corpus, effects, directory] = await Promise.all([
    getPublicGalleryReplications(), getPublicEffects(), getPublicContributorDirectory(),
  ]);
  const rows = corpus.filter(isDisplayable).map(membershipRow);
  return {
    rows, effects: effects.map(({ slug, name }) => ({ slug, name })), directory,
    contentRevision: createHash("sha256").update(JSON.stringify([rows, effects.map(({ slug, name }) => ({ slug, name })), directory])).digest("hex"),
    translationHashes: [...new Set([...rows.map((row) => row.title), ...effects.map((effect) => effect.name)])].map(segmentHash),
  };
}
let canonicalCache: { revision: string; value: Promise<CanonicalIndex> } | undefined;
let localizedCache: { revision: string; value: Promise<CanonicalIndex> } | undefined;

async function translationRevision(locale: string, hashes: string[]): Promise<string> {
  // Read one identity, not every translated record. Including the actual targets
  // detects replacement/deletion even when two publications share a timestamp.
  const rows = await getPostgresClient().sql<{ revision: string | null }>(
    'SELECT md5(jsonb_agg(jsonb_build_array("hash", "target") ORDER BY "hash")::text) AS revision FROM "translationSegments" WHERE "locale" = $1 AND "hash" = ANY($2::text[])',
    [locale, hashes],
  );
  return rows[0]?.revision ?? "empty";
}

export async function getGalleryBrowseIndex(locale: "en" | "zh-Hans"): Promise<GalleryBrowseIndex> {
  const revision = await sourceRevision();
  if (canonicalCache?.revision !== revision) {
    const value = buildCanonicalIndex();
    const entry = { revision, value };
    canonicalCache = entry;
    void value.catch(() => { if (canonicalCache === entry) canonicalCache = undefined; });
  }
  const canonical = await canonicalCache.value;
  if (locale === "en") return { ...canonical, canonical, revision: canonical.contentRevision, cacheIdentity: revision };
  const localizedRevision = `${canonical.contentRevision}:${await translationRevision(locale, canonical.translationHashes)}`;
  const cacheIdentity = `${revision}:${localizedRevision}`;
  if (localizedCache?.revision !== cacheIdentity) {
    const value = (async () => {
      // This is the compact translated matching index, built once per revision.
      // Full records are localized only after bounded membership selection.
      const labels = await getLocalizedLeaves([...canonical.rows.map((row) => row.title), ...canonical.effects.map((effect) => effect.name)], locale);
      return { ...canonical,
        rows: canonical.rows.map((row) => ({ ...row, title: labels.get(row.title) ?? row.title })),
        effects: canonical.effects.map((effect) => ({ ...effect, name: labels.get(effect.name) ?? effect.name })),
      };
    })();
    const entry = { revision: cacheIdentity, value };
    localizedCache = entry;
    void value.catch(() => { if (localizedCache === entry) localizedCache = undefined; });
  }
  return { ...await localizedCache.value, canonical, revision: localizedRevision, cacheIdentity };
}

/** Selected identities alone hydrate; never fall back to a complete corpus. */
export async function hydrateGalleryPage(rows: readonly PublicGalleryReplicationPreview[], locale: "en" | "zh-Hans") {
  const resolved = await getPublicGalleryReplicationsBySlugs(rows.map((row) => row.slug));
  const bySlug = new Map(resolved.map((row) => [row.slug, row]));
  const page = rows.flatMap((member) => {
    const record = bySlug.get(member.slug);
    return record ? [{ ...record, effect_order_index: member.effect_order_index }] : [];
  });
  return locale === "en" ? page : (await localizeRecords(page, locale, "replication")).records;
}
