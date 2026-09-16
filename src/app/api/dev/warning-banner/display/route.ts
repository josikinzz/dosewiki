/**
 * Editor write endpoint for the site-wide safety-banner glyph size (the /dev
 * Banner Studio toolbar).
 *
 *   POST /api/dev/warning-banner/display   { iconSize }  →  { ok, iconSize }
 *
 * The size is one global setting, not a per-preset field, so this sits beside
 * the per-preset route rather than inside it: saving a banner must not be able
 * to change how every other banner is drawn, and changing the size must not
 * require touching a preset. The browser holds no admin intent token, so the
 * write is delegated here the way the sibling route delegates its own — editor
 * session first, then Postgres with the server's token plus the actor's email.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import type { PublicationTarget } from "@server/next/publicationWire";
import { applyPublicCacheLocally } from "@server/next/publishPublicCache";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import {
  clampSafetyBannerIconSize,
  SAFETY_BANNER_ICON_SIZE_MAX,
  SAFETY_BANNER_ICON_SIZE_MIN,
} from "@/data/substanceWarningBanners";

export const runtime = "nodejs";

type BannerDisplayBody = { iconSize?: unknown };

/**
 * A number outside the range is a legal request from a control that offers the
 * range — the clamp answers it. A string, a null or a NaN is a broken caller,
 * and clamping that to 44 would report success for a payload the editor never
 * meant, so it is rejected instead.
 */
function parseBannerDisplayBody(raw: BannerDisplayBody): number {
  if (typeof raw?.iconSize !== "number" || !Number.isFinite(raw.iconSize)) {
    throw new JsonBodyError(
      400,
      `A banner icon size must be a number between ${SAFETY_BANNER_ICON_SIZE_MIN} and ${SAFETY_BANNER_ICON_SIZE_MAX}.`,
    );
  }

  return clampSafetyBannerIconSize(raw.iconSize);
}

export const POST = protectedRouteOperation<BannerDisplayBody, number>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 4 * 1024,
    parse: parseBannerDisplayBody,
  },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to save the safety banner icon size via Next route:",
  unexpectedErrorMessage: "Unable to save the banner icon size right now.",
  operation: async ({ actorEmail, body: iconSize, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey =
      dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;

    const result = await dataWrite.client.mutation(api.siteConfig.saveBannerDisplay, {
      apiKey,
      actorEmail,
      iconSize,
    });

    // Every article showing any banner is now stale, not just one of them: this
    // is the single setting all of them read. The banner tag alone is not
    // enough - `src/app/[slug]/page.tsx` is `revalidate = 3600,
    // dynamicParams = false`, so each article holds its own ISR entry and
    // readers would keep getting the old glyph size for up to an hour. Walk
    // the enabled presets and publish the deduped union of the slugs they
    // cover alongside the banner setting itself.
    const presets = (await dataWrite.client.query(api.warningBanners.listPresets, {})) as
      | { enabled?: unknown; enabledSlugs?: unknown }[]
      | null;
    const touched = new Set<string>();
    for (const preset of Array.isArray(presets) ? presets : []) {
      if (preset?.enabled !== true || !Array.isArray(preset.enabledSlugs)) {
        continue;
      }
      for (const slug of preset.enabledSlugs as unknown[]) {
        if (typeof slug === "string" && slug.length > 0) {
          touched.add(slug);
        }
      }
    }

    const targets: PublicationTarget[] = [{ kind: "banners" }];
    for (const slug of touched) targets.push({ kind: "article", slug });
    applyPublicCacheLocally({ targets, source: "manual" });

    return NextResponse.json({ ok: true, iconSize: result.iconSize });
  },
});
