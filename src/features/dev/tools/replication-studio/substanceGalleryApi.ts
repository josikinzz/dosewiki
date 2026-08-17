import type { GalleryDetail } from "./substanceGalleryPortalModel";

const SUBSTANCES_API = "/api/dev/replications/substances";

export type GalleryDetailResult =
  | { status: "ready"; detail: GalleryDetail }
  | { status: "error"; message: string };

export function galleryCandidatesUrl() {
  return SUBSTANCES_API;
}

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
