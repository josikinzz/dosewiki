/** Admin-only warning publication, reconciliation and attributed history. */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { api } from "@server/postgres/runtime/api";
import type { Id } from "@server/postgres/runtime/dataModel";
import type { PublicationTarget } from "@server/next/publicationWire";
import { applyPublicCacheLocally } from "@server/next/publishPublicCache";
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

type WarningGuard = { baseHash: string; changeId: string; scope: "assignment" | "preset"; slug?: string };

function parseGuard(raw: Record<string, unknown>): WarningGuard {
  if (typeof raw.baseHash !== "string" || !/^[a-f0-9]{64}$/.test(raw.baseHash) ||
      typeof raw.changeId !== "string" || !raw.changeId.trim() || raw.changeId.length > 128) {
    throw new JsonBodyError(400, "A current warning revision and change id are required. Reload the warning.");
  }
  if (raw.scope !== "assignment" && raw.scope !== "preset") throw new JsonBodyError(400, "Choose local assignment or shared preset.");
  if (raw.slug !== undefined && (typeof raw.slug !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(raw.slug))) {
    throw new JsonBodyError(400, "The article slug is malformed.");
  }
  return { baseHash: raw.baseHash, changeId: raw.changeId, scope: raw.scope, ...(raw.slug ? { slug: raw.slug as string } : {}) };
}

function publish(result: { allSubstances: boolean; affectedSlugs: string[] }) {
  const targets: PublicationTarget[] = [{ kind: "banners" }];
  if (!result.allSubstances) {
    // `affectedSlugs` carries the slugs this change removed from the preset as
    // well as the ones it added, so an article that just lost its banner is
    // refreshed too.
    for (const slug of result.affectedSlugs) targets.push({ kind: "article", slug });
  }
  applyPublicCacheLocally({ targets, source: "manual" });
  // A preset that covers every substance has no per-article identity to name,
  // and no content identity expires the root layout, so that one stays a
  // direct call. It only reaches this deployment; the public deployments pick
  // the change up through the delivered `banners` identity.
  if (result.allSubstances) revalidatePath("/", "layout");
  return { status: "pending" as const };
}

const privateHeaders = { "Cache-Control": "private, no-store" };

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
 * `src/data/substanceWarningBanners.ts`, which the Postgres mutation validates
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

type PublishBody = { action: "publish"; preset: ParsedWarningBanner; guard: WarningGuard } |
  { action: "restore"; key: string; revisionId: string; guard: WarningGuard };

export const GET = protectedRouteOperation({
  auth: "admin", rateLimit: "diagnosticRead", capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to read warning editor:",
  operation: async ({ request, actorEmail, dataWrite }) => {
    if (!dataWrite) throw new Error("Postgres write capability is required.");
    const params = new URL(request.url).searchParams;
    const key = params.get("key");
    const apiKey = dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;
    const result = key
      ? await dataWrite.client.query(api.warningBanners.getEditorState, {
          apiKey, actorEmail, key: requireKey(key), ...(params.get("changeId") ? { changeId: params.get("changeId")! } : {}),
        })
      : { presets: await dataWrite.client.query(api.warningBanners.listEditorPresets, { apiKey, actorEmail }) };
    return NextResponse.json(result, { headers: privateHeaders });
  },
});

export const POST = protectedRouteOperation<Record<string, unknown>, PublishBody>({
  auth: "admin", rateLimit: "editorSmallWrite", capabilities: [{ type: "dataWrite" }],
  body: { maxBytes: 64 * 1024, parse: (raw) => {
    const guard = parseGuard(raw);
    if (raw.action === "restore") {
      if (typeof raw.revisionId !== "string" || !raw.revisionId) throw new JsonBodyError(400, "Choose a warning revision to reverse.");
      return { action: "restore", key: requireKey(raw.key), revisionId: raw.revisionId, guard };
    }
    if (raw.action !== "publish") throw new JsonBodyError(400, "Unsupported warning action.");
    return { action: "publish", preset: parseWarningBannerBody(raw), guard };
  } },
  unexpectedErrorLabel: "Failed to publish warning:",
  operation: async ({ actorEmail, body, dataWrite }) => {
    if (!dataWrite) throw new Error("Postgres write capability is required.");
    const apiKey = dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;
    const result = body.action === "restore"
      ? await dataWrite.client.mutation(api.warningBanners.restorePreset, {
          apiKey, actorEmail, key: body.key, baseHash: body.guard.baseHash, changeId: body.guard.changeId,
          revisionId: body.revisionId as Id<"warningBannerRevisions">,
        })
      : await dataWrite.client.mutation(api.warningBanners.upsertPreset, {
          apiKey, actorEmail, ...body.preset, ...body.guard,
        });
    const publication = await publish(result);
    return NextResponse.json({ ok: true, ...result, publication }, { headers: privateHeaders });
  },
});

export const DELETE = protectedRouteOperation<Record<string, unknown>, { key: string; guard: WarningGuard }>({
  auth: "admin", rateLimit: "editorSmallWrite", capabilities: [{ type: "dataWrite" }],
  body: { maxBytes: 4 * 1024, parse: (raw) => {
    const guard = parseGuard(raw);
    if (guard.scope !== "preset" || guard.slug) throw new JsonBodyError(400, "Deleting a warning is a shared preset operation, never a local assignment.");
    return { key: requireKey(raw.key), guard };
  } },
  unexpectedErrorLabel: "Failed to remove warning:",
  operation: async ({ actorEmail, body, dataWrite }) => {
    if (!dataWrite) throw new Error("Postgres write capability is required.");
    const result = await dataWrite.client.mutation(api.warningBanners.removePreset, {
      apiKey: dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey,
      actorEmail, key: body.key, baseHash: body.guard.baseHash, changeId: body.guard.changeId,
    });
    const publication = await publish(result);
    return NextResponse.json({ ok: true, ...result, publication }, { headers: privateHeaders });
  },
});
