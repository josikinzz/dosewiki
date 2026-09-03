/**
 * Admin write endpoint for one drug-class safety banner preset (the /dev
 * Banner Studio).
 *
 *   POST   /api/dev/warning-banner   { key, tone, icon, severityLabel,
 *                                      headline, points, enabled, allSubstances,
 *                                      enabledSlugs }
 *   DELETE /api/dev/warning-banner   { key }
 *
 * The browser holds no admin intent token, so the write is delegated here: the
 * route checks the admin session, then calls `warningBanners.upsertPreset`
 * with the server's own token plus the actor's email for the audit trail.
 *
 * Both verbs revalidate `PUBLIC_CONVEX_CACHE_TAGS.banners` with `expire: 0`,
 * which drops the cached preset list immediately instead of at the end of the
 * 15-minute public-data window, and both also revalidate the article paths the
 * change touches, because each of those pages holds its own ISR entry.
 */
import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { api } from "../../../../../convex/_generated/api";
import { PUBLIC_CONVEX_CACHE_TAGS } from "@server/convex/publicData";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import {
  isWarningBannerTone,
  normalizeEnabledSlugs,
  WARNING_BANNER_ICON_PATTERN,
  WARNING_BANNER_KEY_PATTERN,
  WARNING_BANNER_LIMITS,
  WARNING_BANNER_TONES,
  type WarningBannerTone,
} from "@/data/substanceWarningBanners";

export const runtime = "nodejs";

type WarningBannerBody = {
  key?: unknown;
  tone?: unknown;
  icon?: unknown;
  severityLabel?: unknown;
  headline?: unknown;
  points?: unknown;
  enabled?: unknown;
  allSubstances?: unknown;
  enabledSlugs?: unknown;
};

type ParsedWarningBanner = {
  key: string;
  tone: WarningBannerTone;
  icon: string;
  severityLabel: string;
  headline: string;
  points: string[];
  enabled: boolean;
  allSubstances: boolean;
  enabledSlugs: string[];
};

function requireKey(raw: unknown): string {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!WARNING_BANNER_KEY_PATTERN.test(key)) {
    throw new JsonBodyError(
      400,
      "The preset key is missing or malformed. A key is the stable id the Studio and the article read path share, so it must be lower-case letters, digits, and hyphens, starting with a letter or digit — for example `serotonergic-stack`.",
    );
  }
  return key;
}

/**
 * Every `maxLength` passed in comes from `WARNING_BANNER_LIMITS` in
 * `src/data/substanceWarningBanners.ts`, which the Convex mutation validates
 * against too — the two sides read the same constants so a ceiling can only
 * move in one place. Whitespace is collapsed because a banner renders on one
 * or two lines and a pasted newline would silently break the layout.
 */
function requireText(raw: unknown, field: string, maxLength: number): string {
  if (typeof raw !== "string") {
    throw new JsonBodyError(400, `${field} must be text. Send a string for this field.`);
  }
  const value = raw.replace(/\s+/g, " ").trim();
  if (!value) {
    throw new JsonBodyError(
      400,
      `${field} is empty. Every string a reader sees is stored on the preset, so there is nothing to fall back to — type the wording you want.`,
    );
  }
  if (value.length > maxLength) {
    throw new JsonBodyError(
      400,
      `${field} is ${value.length} characters; the limit is ${maxLength}. Shorten it — a banner that overflows its box on a phone is unreadable.`,
    );
  }
  return value;
}

function requireStringList(
  raw: unknown,
  field: string,
  maxItems: number,
  maxLength: number,
): string[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new JsonBodyError(400, `${field} must be an array of strings.`);
  }
  // `Array.isArray` on an `unknown` narrows to `any[]`; the annotation puts the
  // elements back to `unknown` so the checks below are what prove the type.
  const entries: unknown[] = raw;
  if (entries.length > maxItems) {
    throw new JsonBodyError(
      400,
      `${field} holds ${entries.length} entries; the limit is ${maxItems}. Remove some before saving.`,
    );
  }
  return entries.map((entry) => {
    if (typeof entry !== "string") {
      throw new JsonBodyError(400, `Every entry in ${field} must be a string.`);
    }
    const value = entry.trim();
    if (!value) {
      throw new JsonBodyError(
        400,
        `${field} contains a blank entry. Delete the empty row rather than saving it.`,
      );
    }
    if (value.length > maxLength) {
      throw new JsonBodyError(
        400,
        `An entry in ${field} is ${value.length} characters; the limit is ${maxLength}. Shorten it.`,
      );
    }
    return value;
  });
}

function parseWarningBannerBody(raw: WarningBannerBody): ParsedWarningBanner {
  const key = requireKey(raw.key);

  const { tone, enabled, allSubstances } = raw;
  if (!isWarningBannerTone(tone)) {
    throw new JsonBodyError(
      400,
      `The tone is not one of ${WARNING_BANNER_TONES.join(", ")}. Tone drives the banner's colour and its position in the stack, so it has to be one of the three known severities.`,
    );
  }

  const icon = requireText(raw.icon, "The icon", WARNING_BANNER_LIMITS.iconMaxLength);
  if (!WARNING_BANNER_ICON_PATTERN.test(icon)) {
    throw new JsonBodyError(
      400,
      `The icon "${icon}" is not an Iconify id. An unknown id renders nothing at all, which on a safety banner is an invisible regression — use \`collection:name\` (for example \`lucide:wind\`) or one of this repo's \`custom:\` glyphs.`,
    );
  }

  if (typeof enabled !== "boolean") {
    throw new JsonBodyError(
      400,
      "The enabled switch must be true or false. Banners are opt-in, so an absent switch cannot be read as on.",
    );
  }
  if (typeof allSubstances !== "boolean") {
    throw new JsonBodyError(
      400,
      "The all-substances switch must be true or false. Sitewide scope must be an explicit editorial choice.",
    );
  }


  const enabledSlugs = requireStringList(
    raw.enabledSlugs,
    "The enabled slug list",
    WARNING_BANNER_LIMITS.maxEnabledSlugs,
    WARNING_BANNER_LIMITS.slugMaxLength,
  );

  return {
    key,
    tone,
    icon,
    severityLabel: requireText(
      raw.severityLabel,
      "The severity label",
      WARNING_BANNER_LIMITS.severityLabelMaxLength,
    ),
    headline: requireText(raw.headline, "The headline", WARNING_BANNER_LIMITS.headlineMaxLength),
    points: requireStringList(
      raw.points,
      "The points list",
      WARNING_BANNER_LIMITS.maxPoints,
      WARNING_BANNER_LIMITS.pointMaxLength,
    ),
    enabled,
    allSubstances,
    enabledSlugs: normalizeEnabledSlugs(enabledSlugs),
  };
}

export const POST = protectedRouteOperation<WarningBannerBody, ParsedWarningBanner>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 64 * 1024,
    parse: parseWarningBannerBody,
  },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to save a warning banner preset via Next route:",
  unexpectedErrorMessage: "Unable to save that safety banner right now.",
  operation: async ({ actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey =
      convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;

    const previousPresets = (await convexWrite.client.query(
      api.warningBanners.listPresets,
      {},
    )) as { key?: unknown; allSubstances?: unknown }[];
    const previousWasSitewide = previousPresets.some(
      (preset) => preset.key === body.key && preset.allSubstances === true,
    );

    const result = await convexWrite.client.mutation(api.warningBanners.upsertPreset, {
      apiKey,
      actorEmail,
      key: body.key,
      tone: body.tone,
      icon: body.icon,
      severityLabel: body.severityLabel,
      headline: body.headline,
      points: body.points,
      enabled: body.enabled,
      allSubstances: body.allSubstances,
      enabledSlugs: body.enabledSlugs,
      updatedBy: actorEmail,
    });

    revalidateTag(PUBLIC_CONVEX_CACHE_TAGS.banners, { expire: 0 });

    // A sitewide scope transition invalidates every substance article, including
    // future paths absent from any stored slug list. The layout invalidation is
    // intentionally reserved for that rare operation; ordinary edits retain
    // narrow per-article invalidation.
    if (body.allSubstances || previousWasSitewide) {
      revalidatePath("/", "layout");
    } else {
      const touched = new Set([...body.enabledSlugs, ...result.enabledSlugs]);
      for (const slug of touched) {
        revalidatePath(`/${slug}`);
      }
    }

    return NextResponse.json({
      ok: true,
      key: result.key,
      updated: result.updated,
      allSubstances: result.allSubstances,
      enabledSlugs: result.enabledSlugs,
    });
  },
});

export const DELETE = protectedRouteOperation<{ key?: unknown }, string>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 4 * 1024,
    parse: (raw) => requireKey(raw?.key),
  },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to remove a warning banner preset via Next route:",
  unexpectedErrorMessage: "Unable to remove that safety banner right now.",
  operation: async ({ actorEmail, body: key, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey =
      convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;

    // Read the row before it goes: `removePreset` echoes only `{ removed, key }`,
    // and once the row is gone nothing can say which articles were serving it.
    // Same reason as the POST union above — the tag drops the cached preset
    // list, but each article page has its own ISR entry that would keep
    // painting the warning until the 15-minute window expired.
    const presets = (await convexWrite.client.query(api.warningBanners.listPresets, {})) as
      | { key?: unknown; allSubstances?: unknown; enabledSlugs?: unknown }[]
      | null;
    const covered = (Array.isArray(presets) ? presets : []).find((preset) => preset.key === key);
    const coveredSlugs: unknown[] = Array.isArray(covered?.enabledSlugs)
      ? (covered.enabledSlugs as unknown[])
      : [];

    const result = await convexWrite.client.mutation(api.warningBanners.removePreset, {
      apiKey,
      actorEmail,
      key,
    });

    revalidateTag(PUBLIC_CONVEX_CACHE_TAGS.banners, { expire: 0 });
    if (covered?.allSubstances === true) {
      revalidatePath("/", "layout");
    } else {
      for (const slug of coveredSlugs) {
        if (typeof slug === "string" && slug.length > 0) {
          revalidatePath(`/${slug}`);
        }
      }
    }

    return NextResponse.json({ ok: true, key: result.key, removed: result.removed });
  },
});
