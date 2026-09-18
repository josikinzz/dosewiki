import type { GalleryDetail } from "./substanceGalleryPortalModel";
import {
  fetchGalleryDetail,
  saveGalleryCuration,
  type GalleryDetailResult,
  type SaveGalleryCurationResult,
} from "./substanceGalleryApi";

export type PlacementPreflight = {
  substanceSlug: string;
  substanceTitle: string;
  toAdd: string[];
  alreadyPresent: string[];
  excluded: string[];
};

export type PlacementTargetResult = {
  substanceSlug: string;
  substanceTitle: string;
  status: "saved" | "unchanged" | "conflict" | "error";
  added: string[];
  alreadyPresent: string[];
  excluded: string[];
  ineligible: string[];
  message?: string;
};

export type PlaceReplicationsInput = {
  substanceSlugs: readonly string[];
  replicationSlugs: readonly string[];
};

type PlacementDependencies = {
  fetchDetail?: (slug: string) => Promise<GalleryDetailResult>;
  saveCuration?: (
    slug: string,
    input: {
      curatedSlugs: readonly string[];
      removedSlugs: readonly string[];
      expectedUpdatedAt: string | null;
    },
  ) => Promise<SaveGalleryCurationResult>;
};

function uniqueSlugs(slugs: readonly string[]): string[] {
  return [...new Set(slugs.filter((slug) => slug.length > 0))];
}

/**
 * Classify a requested one-time copy against the version that will be used for
 * compare-and-swap. Per-substance exclusions win: placement never silently
 * restores an editor's previous exclusion.
 */
export function preflightReplicationPlacement(
  detail: GalleryDetail,
  replicationSlugs: readonly string[],
): PlacementPreflight {
  const requested = uniqueSlugs(replicationSlugs);
  const curated = new Set(detail.curation?.curated_slugs ?? []);
  const removed = new Set(detail.curation?.removed_slugs ?? []);
  const alreadyPresent: string[] = [];
  const excluded: string[] = [];
  const toAdd: string[] = [];

  for (const slug of requested) {
    if (removed.has(slug)) excluded.push(slug);
    else if (curated.has(slug)) alreadyPresent.push(slug);
    else toAdd.push(slug);
  }

  return {
    substanceSlug: detail.substance.slug,
    substanceTitle: detail.substance.title,
    toAdd,
    alreadyPresent,
    excluded,
  };
}

async function placeOnSubstance(
  substanceSlug: string,
  replicationSlugs: readonly string[],
  dependencies: Required<PlacementDependencies>,
): Promise<PlacementTargetResult> {
  const detailResult = await dependencies.fetchDetail(substanceSlug);
  if (detailResult.status === "error") {
    return {
      substanceSlug,
      substanceTitle: substanceSlug,
      status: "error",
      added: [],
      alreadyPresent: [],
      excluded: [],
      ineligible: [],
      message: detailResult.message,
    };
  }

  const { detail } = detailResult;
  const preflight = preflightReplicationPlacement(detail, replicationSlugs);
  if (preflight.toAdd.length === 0) {
    return {
      substanceSlug: preflight.substanceSlug,
      substanceTitle: preflight.substanceTitle,
      status: "unchanged",
      added: [],
      alreadyPresent: preflight.alreadyPresent,
      excluded: preflight.excluded,
      ineligible: [],
    };
  }

  const previousCurated = detail.curation?.curated_slugs ?? [];
  const previousRemoved = detail.curation?.removed_slugs ?? [];
  const save = await dependencies.saveCuration(substanceSlug, {
    curatedSlugs: [...previousCurated, ...preflight.toAdd],
    removedSlugs: previousRemoved,
    expectedUpdatedAt: detail.curation?.updated_at ?? null,
  });

  if (save.status !== "saved") {
    return {
      substanceSlug: preflight.substanceSlug,
      substanceTitle: preflight.substanceTitle,
      status: save.status,
      added: [],
      alreadyPresent: preflight.alreadyPresent,
      excluded: preflight.excluded,
      ineligible: [],
      message: save.message,
    };
  }

  const saved = new Set(save.curatedSlugs);
  const added = preflight.toAdd.filter((slug) => saved.has(slug));
  const ineligible = preflight.toAdd.filter((slug) => !saved.has(slug));
  return {
    substanceSlug: preflight.substanceSlug,
    substanceTitle: preflight.substanceTitle,
    status: "saved",
    added,
    alreadyPresent: preflight.alreadyPresent,
    excluded: preflight.excluded,
    ineligible,
  };
}

/**
 * Copy requested works onto several drug galleries once. Every target is read
 * immediately before its own CAS write, and failures stay isolated per target.
 */
export async function placeReplicationsOnSubstances(
  input: PlaceReplicationsInput,
  dependencies: PlacementDependencies = {},
): Promise<PlacementTargetResult[]> {
  const resolved: Required<PlacementDependencies> = {
    fetchDetail: dependencies.fetchDetail ?? fetchGalleryDetail,
    saveCuration: dependencies.saveCuration ?? saveGalleryCuration,
  };
  const substances = uniqueSlugs(input.substanceSlugs);
  const replications = uniqueSlugs(input.replicationSlugs);
  return Promise.all(
    substances.map(async (slug) => {
      try {
        return await placeOnSubstance(slug, replications, resolved);
      } catch {
        return {
          substanceSlug: slug,
          substanceTitle: slug,
          status: "error" as const,
          added: [],
          alreadyPresent: [],
          excluded: [],
          ineligible: [],
          message: "Placement failed unexpectedly for this drug.",
        };
      }
    }),
  );
}
