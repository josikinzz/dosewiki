/**
 * Editor read + write for one contributor profile (the /dev Contributors tab).
 *
 *   GET  /api/dev/contributor-profile?key=JOSIE  → { profile, works, reports }
 *   POST /api/dev/contributor-profile            → patch one profile
 *
 * The browser holds no admin intent token, so both directions are delegated
 * here exactly as the Copy Studio route delegates its write: the route checks
 * the editor session, then talks to Convex with the server's own token plus the
 * actor's email for the audit trail.
 *
 * The GET exists because the public profile projection deliberately drops
 * `membershipEmail` and `avatarStorageId`, and because the two item lists the
 * ordering panels curate live in two other tables. Answering all three in one
 * round trip keeps selecting a contributor to a single request, and lets the
 * route slim the trip report rows — `tripReports.getByContributor` returns whole
 * reports, prose included, where the panel needs a slug, a title and a date.
 *
 * The POST is patch-only all the way down: an omitted field keeps whatever is
 * stored and `null` clears a clearable one, which is `saveProfileAsEditor`'s
 * contract. Sending an avatar file sets `avatarStorageId` and leaves
 * `avatarUrl` alone, because the stored image wins over the remote URL.
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import {
  normalizeAvatarUpload,
  type NormalizedAvatarUpload,
  uploadAvatarToConvex,
} from "@server/next/contributorAvatarUpload";
import { revalidateContributorSurfaces } from "./contributorRevalidation";

export const runtime = "nodejs";

const MAX_PAYLOAD_BYTES = 3 * 1024 * 1024;
const MAX_BIO_LENGTH = 4_000;
const MAX_LINKS = 3;
const MAX_ALIASES = 32;
const MAX_SHORT_TEXT = 200;
const MAX_URL_LENGTH = 2_000;

type ProfilePatchBody = {
  key?: unknown;
  displayName?: unknown;
  bio?: unknown;
  role?: unknown;
  links?: unknown;
  aliases?: unknown;
  membershipEmail?: unknown;
  avatarUrl?: unknown;
  exclude_from_gallery?: unknown;
  archival?: unknown;
  staffNote?: unknown;
  avatarUpload?: {
    filename?: unknown;
    mimeType?: unknown;
    base64?: unknown;
  };
};

type ProfileLink = { label: string; url: string };

type ParsedProfilePatch = {
  key: string;
  patch: {
    displayName?: string;
    bio?: string;
    role?: string | null;
    links?: ProfileLink[];
    aliases?: string[];
    membershipEmail?: string | null;
    avatarUrl?: string | null;
    exclude_from_gallery?: boolean;
    archival?: boolean;
    staffNote?: { markdown: string; attribution?: string } | null;
  };
  avatarUpload: NormalizedAvatarUpload | null;
};

function requireProfileKey(raw: unknown): string {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key || key.length > MAX_SHORT_TEXT) {
    throw new JsonBodyError(400, "A contributor profile key is required.");
  }
  return key;
}

/**
 * `undefined` means the field was not sent and must be left alone; an emptied
 * string means the editor cleared it, which is `null` on the Convex side. The
 * patch mutation cannot express "clear" any other way.
 */
function parseNullableText(raw: unknown, label: string): string | null | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (raw === null) {
    return null;
  }
  if (typeof raw !== "string") {
    throw new JsonBodyError(400, `${label} must be a string or null.`);
  }
  if (raw.length > MAX_SHORT_TEXT) {
    throw new JsonBodyError(400, `${label} must be ${MAX_SHORT_TEXT} characters or fewer.`);
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parseLinks(raw: unknown): ProfileLink[] {
  if (!Array.isArray(raw)) {
    throw new JsonBodyError(400, "Links must be an array.");
  }
  if (raw.length > MAX_LINKS) {
    throw new JsonBodyError(400, `A profile may carry at most ${MAX_LINKS} links.`);
  }

  return raw.map((entry) => {
    const link = entry as { label?: unknown; url?: unknown };
    const label = typeof link?.label === "string" ? link.label.trim() : "";
    const url = typeof link?.url === "string" ? link.url.trim() : "";
    if (!label || !url) {
      throw new JsonBodyError(400, "Every link needs both a label and a URL.");
    }
    if (label.length > MAX_SHORT_TEXT || url.length > MAX_URL_LENGTH) {
      throw new JsonBodyError(400, "That link label or URL is too long.");
    }
    return { label, url };
  });
}

function parseAliases(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new JsonBodyError(400, "Aliases must be an array.");
  }
  if (raw.length > MAX_ALIASES) {
    throw new JsonBodyError(400, `A profile may carry at most ${MAX_ALIASES} aliases.`);
  }

  return raw.map((entry) => {
    if (typeof entry !== "string") {
      throw new JsonBodyError(400, "Each alias must be a string.");
    }
    const alias = entry.trim();
    if (!alias || alias.length > MAX_SHORT_TEXT) {
      throw new JsonBodyError(400, `An alias must be 1 to ${MAX_SHORT_TEXT} characters.`);
    }
    return alias;
  });
}

/**
 * `null` (or a note emptied down to nothing) clears the stored staff note;
 * anything else must be a `{ markdown, attribution? }` object. The Convex
 * patch builder does the canonical sanitization; the length caps here just
 * bound the payload the same way the bio field is bounded.
 */
function parseStaffNote(
  raw: unknown,
): { markdown: string; attribution?: string } | null {
  if (raw === null) {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new JsonBodyError(400, "The editor's note must be an object or null.");
  }

  const { markdown, attribution } = raw as { markdown?: unknown; attribution?: unknown };
  if (typeof markdown !== "string") {
    throw new JsonBodyError(400, "The editor's note markdown must be a string.");
  }
  if (markdown.length > MAX_BIO_LENGTH) {
    throw new JsonBodyError(
      400,
      `The editor's note must be ${MAX_BIO_LENGTH} characters or fewer.`,
    );
  }
  if (attribution !== undefined && attribution !== null && typeof attribution !== "string") {
    throw new JsonBodyError(400, "The editor's note attribution must be a string.");
  }
  const trimmedAttribution = typeof attribution === "string" ? attribution.trim() : "";
  if (trimmedAttribution.length > MAX_SHORT_TEXT) {
    throw new JsonBodyError(
      400,
      `The editor's note attribution must be ${MAX_SHORT_TEXT} characters or fewer.`,
    );
  }

  if (!markdown.trim()) {
    return null;
  }

  return trimmedAttribution
    ? { markdown, attribution: trimmedAttribution }
    : { markdown };
}

export function parseProfilePatchBody(raw: ProfilePatchBody): ParsedProfilePatch {
  const key = requireProfileKey(raw.key);
  const patch: ParsedProfilePatch["patch"] = {};

  if (raw.displayName !== undefined) {
    if (typeof raw.displayName !== "string" || !raw.displayName.trim()) {
      throw new JsonBodyError(400, "A display name is required.");
    }
    if (raw.displayName.length > MAX_SHORT_TEXT) {
      throw new JsonBodyError(
        400,
        `The display name must be ${MAX_SHORT_TEXT} characters or fewer.`,
      );
    }
    patch.displayName = raw.displayName.trim();
  }

  if (raw.bio !== undefined) {
    if (typeof raw.bio !== "string") {
      throw new JsonBodyError(400, "The bio must be a string.");
    }
    if (raw.bio.length > MAX_BIO_LENGTH) {
      throw new JsonBodyError(400, `The bio must be ${MAX_BIO_LENGTH} characters or fewer.`);
    }
    patch.bio = raw.bio;
  }

  const role = parseNullableText(raw.role, "The role");
  if (role !== undefined) {
    patch.role = role;
  }

  const membershipEmail = parseNullableText(raw.membershipEmail, "The membership email");
  if (membershipEmail !== undefined) {
    patch.membershipEmail = membershipEmail;
  }

  const avatarUrl = parseNullableText(raw.avatarUrl, "The avatar URL");
  if (avatarUrl !== undefined) {
    patch.avatarUrl = avatarUrl;
  }

  if (raw.links !== undefined) {
    patch.links = parseLinks(raw.links);
  }

  if (raw.aliases !== undefined) {
    patch.aliases = parseAliases(raw.aliases);
  }

  if (raw.exclude_from_gallery !== undefined) {
    if (typeof raw.exclude_from_gallery !== "boolean") {
      throw new JsonBodyError(400, "The gallery exclusion flag must be a boolean.");
    }
    patch.exclude_from_gallery = raw.exclude_from_gallery;
  }

  if (raw.archival !== undefined) {
    if (typeof raw.archival !== "boolean") {
      throw new JsonBodyError(400, "The archival flag must be a boolean.");
    }
    patch.archival = raw.archival;
  }

  if (raw.staffNote !== undefined) {
    patch.staffNote = parseStaffNote(raw.staffNote);
  }

  return {
    key,
    patch,
    avatarUpload: normalizeAvatarUpload(raw.avatarUpload),
  };
}

type ReplicationRow = {
  slug: string;
  title: string;
  artist: string;
  role?: string;
  type: string;
  effect_slug?: string;
  created_at?: string;
  thumbnail_url?: string | null;
};

type TripReportRow = {
  slug: string;
  title: string;
  subject: { name: string; trip_date?: string };
  featured?: boolean;
};

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to load a contributor profile via Next route:",
  unexpectedErrorMessage: "Unable to load that contributor right now.",
  operation: async ({ actorEmail, convexWrite, request }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey = convexWrite.getAdminIntentToken?.("profileMediaWrite") ?? convexWrite.adminKey;
    const key = new URL(request.url).searchParams.get("key")?.trim() ?? "";
    if (!key) {
      return NextResponse.json(
        { error: "A contributor profile key is required." },
        { status: 400 },
      );
    }

    const profile = await convexWrite.client.query(api.contributorProfiles.getEditorProfile, {
      apiKey,
      actorEmail,
      key,
    });

    if (!profile) {
      return NextResponse.json({ error: `No contributor profile for "${key}".` }, { status: 404 });
    }

    // The same name set the public gallery matches on: display name plus every
    // stored alias. Matching narrower here would show the editor a different
    // list from the one their saved ordering actually reorders.
    const artistNames = [profile.displayName, ...profile.aliases].filter(Boolean);

    const [works, reports] = await Promise.all([
      convexWrite.client.query(api.replications.getByArtistNames, { artistNames }),
      convexWrite.client.query(api.tripReports.getByContributor, {
        profileKey: profile.key,
        authorNames: artistNames.map((name) => name.toLowerCase()),
      }),
    ]);

    return NextResponse.json({
      ok: true,
      profile,
      works: (works as ReplicationRow[]).map((row) => ({
        slug: row.slug,
        title: row.title,
        artist: row.artist,
        role: row.role ?? "replication",
        type: row.type,
        effectSlug: row.effect_slug ?? null,
        createdAt: row.created_at ?? null,
        thumbnailUrl: row.thumbnail_url ?? null,
      })),
      reports: (reports as TripReportRow[]).map((row) => ({
        slug: row.slug,
        title: row.title,
        authorName: row.subject?.name ?? "",
        tripDate: row.subject?.trip_date ?? null,
        featured: row.featured === true,
      })),
    });
  },
});

export const POST = protectedRouteOperation<ProfilePatchBody, ParsedProfilePatch>({
  auth: "editor",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: MAX_PAYLOAD_BYTES,
    parse: parseProfilePatchBody,
  },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to save a contributor profile via Next route:",
  unexpectedErrorMessage: "Unable to save that contributor profile right now.",
  operation: async ({ actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey = convexWrite.getAdminIntentToken?.("profileMediaWrite") ?? convexWrite.adminKey;
    const avatarStorageId = body.avatarUpload
      ? await uploadAvatarToConvex(body.avatarUpload, convexWrite, actorEmail)
      : undefined;

    const result = await convexWrite.client.mutation(api.contributorProfiles.saveProfileAsEditor, {
      apiKey,
      actorEmail,
      key: body.key,
      patch: {
        ...body.patch,
        ...(avatarStorageId ? { avatarStorageId } : {}),
      },
    });

    revalidateContributorSurfaces({
      contributorKeys: result.revalidate?.contributorKeys ?? [body.key],
      scope: "profile",
      // The /replications gallery corpus filters on this flag, so flipping it
      // must land there on the next request, not at the end of the cache window.
      galleryVisibilityChanged: body.patch.exclude_from_gallery !== undefined,
    });

    return NextResponse.json({ ok: true, profile: result.profile });
  },
});
