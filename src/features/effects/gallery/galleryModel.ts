import type { ContributorDirectory } from "@server/contributorDirectory";
import { findContributorProfileByAuthorName } from "@server/contributorProfileIdentity";
import { getPublicRoutePath } from "@/utils/publicRouteIdentity";
import { applyCuratedOrder } from "@server/curatedOrder";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import { curatedEffectPosition, depictedEffects } from "@/types/replications";
import { msg } from "@/i18n/messages";
import {
  artistIdentity,
  artistUrlKeyFromIdentity,
  isWithheldFromArtistViews,
  UNATTRIBUTED_KEY,
} from "./galleryArtistIdentity";
import { sortWithinGroup, sortWorksByDate, workDateMs } from "./galleryOrdering";
import {
  UNDATED_YEAR_FILTER,
  type GalleryCounts,
  type GalleryGroup,
  type GalleryOrder,
} from "./galleryTypes";

function tally(items: PublicGalleryReplicationPreview[]) {
  let imageCount = 0;
  let videoCount = 0;
  let audioCount = 0;
  for (const item of items) {
    if (item.type === "video") videoCount += 1;
    else if (item.type === "audio") audioCount += 1;
    else imageCount += 1;
  }
  return { imageCount, videoCount, audioCount };
}

function toExternalArtistUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

export function groupByArtist(
  replications: PublicGalleryReplicationPreview[],
  contributorDirectory: ContributorDirectory = [],
  order: GalleryOrder = "newest",
): GalleryGroup[] {
  const buckets = new Map<string, GalleryGroup>();
  const profileByCredit = new Map<string, ContributorDirectory[number] | null>();
  const profileByBucket = new Map<string, ContributorDirectory[number]>();
  const canonicalExternalUrl = new Set<string>();

  for (const replication of replications) {
    if (isWithheldFromArtistViews(replication)) continue;
    const credit = artistIdentity(replication.artist);
    let profile = profileByCredit.get(credit.key);
    if (profile === undefined) {
      profile =
        credit.key === UNATTRIBUTED_KEY
          ? null
          : (findContributorProfileByAuthorName(contributorDirectory, credit.label) ?? null);
      profileByCredit.set(credit.key, profile);
    }
    const { key, label } = profile ? artistIdentity(profile.displayName) : credit;
    const creditKey = artistUrlKeyFromIdentity(credit.key, credit.label);
    let group = buckets.get(key);
    if (!group) {
      group = {
        key,
        label,
        href:
          key === UNATTRIBUTED_KEY
            ? undefined
            : getPublicRoutePath({
                family: "replicationArtist",
                params: { key: artistUrlKeyFromIdentity(key, label) },
              }),
        externalUrl: undefined,
        count: 0,
        imageCount: 0,
        videoCount: 0,
        audioCount: 0,
        creditKeys: [creditKey],
        items: [],
      };
      buckets.set(key, group);
      if (profile) profileByBucket.set(key, profile);
    } else if (!group.creditKeys!.includes(creditKey)) {
      group.creditKeys!.push(creditKey);
    }
    const externalUrl = toExternalArtistUrl(replication.artist_url);
    if (externalUrl) {
      const canonical = credit.key === key;
      if (!group.externalUrl || (canonical && !canonicalExternalUrl.has(key))) {
        group.externalUrl = externalUrl;
      }
      if (canonical) canonicalExternalUrl.add(key);
    }
    group.items.push(replication);
  }

  const groups = Array.from(buckets.values()).map((group) => {
    const profile = profileByBucket.get(group.key);
    const items = sortWorksByDate(
      group.items,
      order === "oldest" ? "oldest" : "newest",
    );
    const { imageCount, videoCount, audioCount } = tally(items);
    return {
      ...group,
      items,
      count: items.length,
      imageCount,
      videoCount,
      audioCount,
      ...(profile?.approvedReplicator === true ? { approvedReplicator: true } : {}),
    };
  });

  return groups.sort((a, b) => {
    if (a.key === UNATTRIBUTED_KEY) return 1;
    if (b.key === UNATTRIBUTED_KEY) return -1;
    const approved =
      Number(b.approvedReplicator === true) - Number(a.approvedReplicator === true);
    if (approved !== 0) return approved;
    const tier = Number(b.videoCount > 0) - Number(a.videoCount > 0);
    if (tier !== 0) return tier;
    if (a.count !== b.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });
}

export function selectContributorDirectoryForWorks(
  replications: PublicGalleryReplicationPreview[],
  contributorDirectory: ContributorDirectory,
): ContributorDirectory {
  const claimedKeys = new Set<string>();
  const resolvedCredits = new Set<string>();
  for (const replication of replications) {
    if (isWithheldFromArtistViews(replication)) continue;
    const credit = artistIdentity(replication.artist);
    if (credit.key === UNATTRIBUTED_KEY || resolvedCredits.has(credit.key)) continue;
    resolvedCredits.add(credit.key);
    const profile = findContributorProfileByAuthorName(
      contributorDirectory,
      credit.label,
    );
    if (profile) claimedKeys.add(profile.key);
  }
  return contributorDirectory.filter((entry) => claimedKeys.has(entry.key));
}

function curatedPrefixOf(group: GalleryGroup): string[] | undefined {
  const curated = group.items
    .map((item) => ({
      slug: item.slug,
      position: curatedEffectPosition(item, group.key),
    }))
    .filter(
      (entry): entry is { slug: string; position: number } =>
        entry.position !== undefined,
    )
    .sort((left, right) => left.position - right.position)
    .map((entry) => entry.slug);
  return curated.length ? curated : undefined;
}

export function groupByEffect(
  replications: PublicGalleryReplicationPreview[],
  effectName: (slug: string) => string,
  effectHref: (slug: string) => string | undefined,
  order: GalleryOrder = "curated",
): GalleryGroup[] {
  const buckets = new Map<string, GalleryGroup>();
  for (const replication of replications) {
    for (const slug of depictedEffects(replication)) {
      let group = buckets.get(slug);
      if (!group) {
        group = {
          key: slug,
          label: effectName(slug),
          href: effectHref(slug),
          count: 0,
          imageCount: 0,
          videoCount: 0,
          audioCount: 0,
          items: [],
        };
        buckets.set(slug, group);
      }
      group.items.push(replication);
    }
  }

  const groups = Array.from(buckets.values()).map((group) => {
    const items =
      order === "curated"
        ? applyCuratedOrder(
            sortWithinGroup(group.items, group.key),
            curatedPrefixOf(group),
            (replication) => replication.slug,
          )
        : sortWorksByDate(group.items, order);
    const { imageCount, videoCount, audioCount } = tally(items);
    return { ...group, items, count: items.length, imageCount, videoCount, audioCount };
  });
  return groups.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });
}

export const UNDATED_YEAR_LABEL = msg("Undated");
const MIN_RAIL_SIZE = 3;

export function groupByYear(
  replications: PublicGalleryReplicationPreview[],
  order: GalleryOrder = "newest",
): GalleryGroup[] {
  const direction = order === "oldest" ? "oldest" : "newest";
  const byYear = new Map<number, PublicGalleryReplicationPreview[]>();
  const undated: PublicGalleryReplicationPreview[] = [];
  for (const replication of replications) {
    const ms = workDateMs(replication);
    if (ms === null) {
      undated.push(replication);
      continue;
    }
    const year = new Date(ms).getUTCFullYear();
    const bucket = byYear.get(year);
    if (bucket) bucket.push(replication);
    else byYear.set(year, [replication]);
  }

  const years = [...byYear.keys()].sort((a, b) => b - a);
  let perYearFloor = Number.POSITIVE_INFINITY;
  for (const year of years) {
    if ((byYear.get(year) ?? []).length < MIN_RAIL_SIZE) break;
    perYearFloor = year;
  }

  const buckets: Array<{ items: PublicGalleryReplicationPreview[]; years: number[] }> = [];
  let carried: { items: PublicGalleryReplicationPreview[]; years: number[] } | null = null;
  for (const year of [...years].reverse()) {
    const items = byYear.get(year) ?? [];
    if (year >= perYearFloor) {
      if (carried) {
        buckets.push(carried);
        carried = null;
      }
      buckets.push({ items, years: [year] });
      continue;
    }
    const decade = Math.floor(year / 10) * 10;
    const sameDecade =
      carried !== null && Math.floor(carried.years[0] / 10) * 10 === decade;
    if (carried && (sameDecade || carried.items.length < MIN_RAIL_SIZE)) {
      carried.items.push(...items);
      carried.years.push(year);
    } else {
      if (carried) buckets.push(carried);
      carried = { items: [...items], years: [year] };
    }
  }
  if (carried) buckets.push(carried);

  const groups: GalleryGroup[] = buckets.map((bucket) => {
    const span = [...bucket.years].sort((a, b) => a - b);
    const first = span[0];
    const last = span[span.length - 1];
    const items = sortWorksByDate(bucket.items, direction);
    const { imageCount, videoCount, audioCount } = tally(items);
    return {
      key: first === last ? `${first}` : `${first}-${last}`,
      label: first === last ? `${first}` : `${first}\u2013${last}`,
      count: items.length,
      imageCount,
      videoCount,
      audioCount,
      items,
    };
  });
  const spanStart = (group: GalleryGroup) => Number(group.key.split("-")[0]);
  const spanEnd = (group: GalleryGroup) => {
    const parts = group.key.split("-");
    return Number(parts[parts.length - 1]);
  };
  groups.sort((a, b) =>
    direction === "oldest" ? spanStart(a) - spanStart(b) : spanEnd(b) - spanEnd(a),
  );

  if (undated.length) {
    const items = sortWorksByDate(undated, direction);
    const { imageCount, videoCount, audioCount } = tally(items);
    groups.push({
      key: UNDATED_YEAR_FILTER,
      label: UNDATED_YEAR_LABEL,
      count: items.length,
      imageCount,
      videoCount,
      audioCount,
      items,
    });
  }
  return groups;
}

export function splitRailsAndPool(
  groups: GalleryGroup[],
  minRailSize: number = MIN_RAIL_SIZE,
): { rails: GalleryGroup[]; pool: GalleryGroup[] } {
  const rails: GalleryGroup[] = [];
  const pool: GalleryGroup[] = [];
  for (const group of groups) {
    (group.count >= minRailSize ? rails : pool).push(group);
  }
  return { rails, pool };
}

export function countGallery(
  replications: PublicGalleryReplicationPreview[],
): GalleryCounts {
  const artists = new Set<string>();
  const effects = new Set<string>();
  let images = 0;
  let videos = 0;
  for (const replication of replications) {
    artists.add(artistIdentity(replication.artist).key);
    for (const slug of depictedEffects(replication)) effects.add(slug);
    if (replication.type === "video") videos += 1;
    else images += 1;
  }
  return {
    total: replications.length,
    artists: artists.size,
    effects: effects.size,
    images,
    videos,
  };
}
