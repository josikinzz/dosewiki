import { NextResponse } from "next/server";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { getGalleryBrowseIndex } from "@server/next/galleryBrowseIndex";
import { getGalleryBrowsePage, StaleGalleryCursorError } from "@server/next/galleryBrowsePage";
import { parseUiLocale } from "@/i18n/messages";
import { parseGalleryBrowseState, parseReplicationViewerSlug } from "@/features/replications/galleryUrlState";
import type { GalleryFocus } from "@/features/replications/galleryUrlState";

export const runtime = "nodejs";
const CACHE_CONTROL = "private, no-store";

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "publicContentApiRead");
  if (limited) return limited;
  const url = new URL(request.url);
  const locale = parseUiLocale(url.searchParams.get("locale")) === "zh-Hans" ? "zh-Hans" : "en";
  const browse = parseGalleryBrowseState(url.searchParams);
  const viewerSlug = parseReplicationViewerSlug(url.searchParams);
  const focusKind = url.searchParams.get("focusKind");
  const focusKey = url.searchParams.get("focusKey");
  const focus: GalleryFocus | null = (focusKind === "artist" || focusKind === "effect") && focusKey ? { kind: focusKind, key: focusKey } : null;
  try {
    const index = await getGalleryBrowseIndex(locale);
    const page = await getGalleryBrowsePage(index, locale, browse, focus, url.searchParams.get("cursor"), viewerSlug);
    return NextResponse.json(page, { headers: { "Cache-Control": CACHE_CONTROL } });
  } catch (error) {
    if (error instanceof StaleGalleryCursorError) {
      return NextResponse.json({ error: error.message }, { status: 409, headers: { "Cache-Control": CACHE_CONTROL } });
    }
    console.error("Failed to read replication gallery page:", error);
    return NextResponse.json({ error: "Replication gallery data is temporarily unavailable." }, {
      status: 503, headers: { "Cache-Control": CACHE_CONTROL },
    });
  }
}
