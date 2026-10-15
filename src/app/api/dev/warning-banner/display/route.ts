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
