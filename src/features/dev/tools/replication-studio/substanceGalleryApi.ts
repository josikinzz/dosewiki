import type { GalleryCandidate, GalleryDetail } from "./substanceGalleryPortalModel";

const SUBSTANCES_API = "/api/dev/replications/substances";

export type GalleryDetailResult =
  | { status: "ready"; detail: GalleryDetail }
  | { status: "error"; message: string };

export type GalleryCandidatesResult =
  | { status: "ready"; candidates: GalleryCandidate[] }
  | { status: "error"; message: string };

function galleryCandidatesUrl() { return SUBSTANCES_API; }

export function galleryDetailUrl(slug: string) {
  return `${SUBSTANCES_API}/${encodeURIComponent(slug)}`;
}

export async function readGalleryApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function fetchGalleryCandidates(): Promise<GalleryCandidatesResult> {
  try {
    const response = await fetch(galleryCandidatesUrl());
    if (!response.ok) {
      return {
        status: "error",
        message: await readGalleryApiError(response, "Failed to load the substance list."),
      };
    }
    const payload = (await response.json()) as { substances?: GalleryCandidate[] };
    return Array.isArray(payload.substances)
      ? { status: "ready", candidates: payload.substances }
      : { status: "error", message: "The substances endpoint returned no substance list." };
  } catch {
    return { status: "error", message: "Failed to reach the substance list endpoint." };
  }
}

export async function fetchGalleryDetail(slug: string): Promise<GalleryDetailResult> {
  try {
    const response = await fetch(galleryDetailUrl(slug));
    if (!response.ok) {
      return {
        status: "error",
        message: await readGalleryApiError(response, "Failed to load that substance's gallery."),
      };
    }
    return { status: "ready", detail: (await response.json()) as GalleryDetail };
  } catch {
    return { status: "error", message: "Failed to reach the gallery endpoint." };
  }
}

export type SaveGalleryCurationResult =
  | {
      status: "saved";
      curatedSlugs: string[];
      removedSlugs: string[];
      prunedCurated: string[];
      updatedAt: string;
    }
  | { status: "conflict"; message: string }
  | { status: "error"; message: string };

export async function saveGalleryCuration(
  slug: string,
  input: {
    curatedSlugs: readonly string[];
    removedSlugs: readonly string[];
    expectedUpdatedAt: string | null;
  },
): Promise<SaveGalleryCurationResult> {
  try {
    const response = await fetch(galleryDetailUrl(slug), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const message = await readGalleryApiError(response, "Failed to save that substance's gallery.");
      return response.status === 409
        ? { status: "conflict", message }
        : { status: "error", message };
    }
    const payload = (await response.json()) as {
      curated_slugs?: string[];
      removed_slugs?: string[];
      pruned_curated?: string[];
      updated_at?: string;
    };
    if (
      !Array.isArray(payload.curated_slugs)
      || !Array.isArray(payload.removed_slugs)
      || !Array.isArray(payload.pruned_curated)
      || typeof payload.updated_at !== "string"
    ) {
      return { status: "error", message: "The gallery save returned an incomplete result." };
    }
    return {
      status: "saved",
      curatedSlugs: payload.curated_slugs,
      removedSlugs: payload.removed_slugs,
      prunedCurated: payload.pruned_curated,
      updatedAt: payload.updated_at,
    };
  } catch {
    return { status: "error", message: "Failed to reach the gallery endpoint." };
  }
}
