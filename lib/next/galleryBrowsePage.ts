import { createHash } from "node:crypto";
import type { GalleryBrowseIndex } from "./galleryBrowseIndex";
import { hydrateGalleryPage } from "./galleryBrowseIndex";
import { matchesQuery, matchesTaxonomyFilters, matchesType, matchesYear } from "@/features/effects/gallery/galleryFilters";
import { groupByArtist, groupByEffect, groupByYear, selectContributorDirectoryForWorks } from "@/features/effects/gallery/galleryModel";
import { effectHrefBuilder, effectNameLookup, galleryGroupUrlKey, isWithheldFromArtistViews } from "@/features/effects/gallery/galleryArtistIdentity";
import { sortWithinGroup } from "@/features/effects/gallery/galleryOrdering";
import { ARTIST_RAIL_PAGE, RAIL_PREVIEW_LIMIT, type GalleryGroup } from "@/features/effects/gallery/galleryTypes";
import type { GalleryBrowseState, GalleryFocus } from "@/features/replications/galleryUrlState";
import { galleryQueryIdentity, type GalleryFacets, type GalleryPagePayload } from "@/features/replications/galleryPage";
import type { PublicGalleryReplicationPreview } from "@/types/replications";

const WORK_PAGE_SIZE = 64;
const CURSOR_VERSION = 2;
interface Membership {
  ordered: PublicGalleryReplicationPreview[];
  groups: GalleryGroup[];
  facets: GalleryFacets;
}
const memberships = new Map<string, Membership>();
let membershipRevision = "";

function selectMembership(index: GalleryBrowseIndex, browse: GalleryBrowseState, focus: GalleryFocus | null, key: string): Membership {
  if (membershipRevision !== index.cacheIdentity) {
    memberships.clear();
    membershipRevision = index.cacheIdentity;
  }
  const existing = memberships.get(key);
  if (existing) return existing;
  const effectName = effectNameLookup(index.effects);
  const canonicalName = effectNameLookup(index.canonical.effects);
  const canonicalById = new Map(index.canonical.rows.map((row) => [row._id, row]));
  const facets = {
    drugs: [...new Map(index.rows.flatMap((item) =>
      (item.title_drugs ?? []).map((drug) => [drug.slug, { value: drug.slug, label: drug.name }] as const),
    )).values()].sort((a, b) => a.label.localeCompare(b.label)),
    effects: [...new Set(index.rows.flatMap((item) =>
      [item.effect_slug, ...(item.effect_tags ?? [])].filter((slug): slug is string => Boolean(slug)),
    ))].map((value) => ({ value, label: effectName(value) })).sort((a, b) => a.label.localeCompare(b.label)),
  };
  const mode = focus?.kind ?? browse.view;
  const filtered = index.rows.filter((item) =>
    matchesTaxonomyFilters(item, browse) && matchesType(item, browse.type) && matchesYear(item, browse.year) &&
    (matchesQuery(item, browse.query, effectName) || matchesQuery(canonicalById.get(item._id) ?? item, browse.query, canonicalName)) &&
    (mode !== "artist" || browse.query.trim() || !isWithheldFromArtistViews(item)),
  );
  const href = effectHrefBuilder("/effects", new Set(index.effects.map((effect) => effect.slug)));
  const allGroups = mode === "effect" ? groupByEffect(filtered, effectName, href, browse.sort)
    : mode === "year" ? groupByYear(filtered, browse.sort) : groupByArtist(filtered, index.directory, browse.sort);
  const groups = focus ? allGroups.filter((group) => galleryGroupUrlKey(focus.kind, group) === focus.key) : allGroups;
  const seen = new Set<string>();
  const ordered = (!focus && browse.query.trim() ? sortWithinGroup(filtered) : groups.flatMap((group) => group.items))
    .filter((item) => seen.has(item._id) ? false : (seen.add(item._id), true));
  const membership = { ordered, facets, groups };
  if (memberships.size >= 32) memberships.delete(memberships.keys().next().value!);
  memberships.set(key, membership);
  return membership;
}

export class StaleGalleryCursorError extends Error {}

/** Artist browsing pages rail previews, while focused/search grids page every work. */
export async function getGalleryBrowsePage(index: GalleryBrowseIndex, locale: "en" | "zh-Hans", browse: GalleryBrowseState,
  focus: GalleryFocus | null = null, cursor: string | null = null, viewerSlug: string | null = null): Promise<GalleryPagePayload> {
  const queryIdentity = galleryQueryIdentity(locale, browse, focus);
  const key = createHash("sha256").update(queryIdentity).digest("hex");
  const railPage = !focus && browse.view === "artist" && !browse.query.trim() && browse.year === "all";
  let offset = 0;
  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString());
      if (decoded.version !== CURSOR_VERSION || decoded.revision !== index.revision || decoded.key !== key ||
        !Number.isSafeInteger(decoded.offset) || decoded.offset < 0) throw new StaleGalleryCursorError();
      offset = decoded.offset;
    } catch {
      throw new StaleGalleryCursorError("The gallery changed. Reload this selection to continue.");
    }
  }
  const membership = selectMembership(index, browse, focus, key);
  const selectedGroups = railPage ? membership.groups.slice(offset, offset + ARTIST_RAIL_PAGE) : [];
  const selectedIds = new Map(selectedGroups.map((group) => [group.key, group.items.slice(0, RAIL_PREVIEW_LIMIT).map((item) => item._id)]));
  const members = railPage ? selectedGroups.flatMap((group) => group.items.slice(0, RAIL_PREVIEW_LIMIT))
    : membership.ordered.slice(offset, offset + WORK_PAGE_SIZE);
  const page = [...new Map(members.map((item) => [item._id, item])).values()];
  const linked = viewerSlug ? membership.ordered.find((item) => item.slug === viewerSlug) : undefined;
  if (linked && !page.some((item) => item._id === linked._id)) page.push(linked);
  // Keep each selected-slug read bounded, without serializing independent batches.
  const pages: Array<Promise<PublicGalleryReplicationPreview[]>> = [];
  for (let start = 0; start < page.length; start += WORK_PAGE_SIZE) {
    pages.push(hydrateGalleryPage(page.slice(start, start + WORK_PAGE_SIZE), locale));
  }
  const data = (await Promise.all(pages)).flat();
  const nextOffset = offset + (railPage ? ARTIST_RAIL_PAGE : WORK_PAGE_SIZE);
  const length = railPage ? membership.groups.length : membership.ordered.length;
  return {
    data, queryIdentity, total: membership.ordered.length,
    nextCursor: nextOffset < length
      ? Buffer.from(JSON.stringify({ version: CURSOR_VERSION, revision: index.revision, key, offset: nextOffset })).toString("base64url") : null,
    groups: membership.groups.map(({ key: groupKey, label, count, imageCount, videoCount }) => ({
      key: groupKey, label, count, imageCount, videoCount,
      ...(railPage ? { itemIds: selectedIds.get(groupKey) ?? [] } : {}),
    })),
    facets: membership.facets,
    contributorDirectory: selectContributorDirectoryForWorks(data, index.directory),
  };
}
