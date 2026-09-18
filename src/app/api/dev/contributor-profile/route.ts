/**
 * Read + write for one contributor profile (the /dev Contributors tab).
 *
 *   GET  /api/dev/contributor-profile?key=JOSIE  → { profile, works, reports }
 *   POST /api/dev/contributor-profile            → patch one profile
 *
 * The browser holds no admin intent token, so both directions are delegated
 * here exactly as the Copy Studio route delegates its write: the route checks
 * the session, then talks to Postgres with the server's own token plus the
 * actor's email for the audit trail.
 *
 * Three roles share the route. An admin may read and patch any record and any
 * field. An editor may read any record but patch only their own: the record
 * whose membership email is theirs, or the still-unclaimed record their
 * sign-in derives to. The route refuses the obvious case (a record another
 * sign-in holds) with 403 before writing, and Postgres's `saveProfileAsEditor`
 * applies the same rule with the actor's real membership role, so a
 * misconfigured route still cannot escalate. `saveProfileAsEditor` also
 * refuses the trust fields (role, membership email, approved replicator,
 * gallery exclusion, archival, staff note) for anyone below admin, whatever
 * the payload carries. A signed-in contributor may read and save only their
 * own record and only its self-serve fields; that write goes through
 * `saveProfile`, whose ownership rule Postgres enforces the same way, and the
 * read withholds the staff-only fields. A missing own record comes back blank
 * so the first save creates it.
 *
 * The GET exists because the public profile projection deliberately drops
 * `membershipEmail` and `avatarStorageId`, and because the two item lists the
 * ordering panels curate live in two other tables. Answering all three in one
 * round trip keeps selecting a contributor to a single request, and lets the
 * route slim the trip report rows: `tripReports.getByContributor` returns whole
 * reports, prose included, where the panel needs a slug, a title and a date.
 *
 * The editor POST is patch-only all the way down: an omitted field keeps
 * whatever is stored and `null` clears a clearable one, which is
 * `saveProfileAsEditor`'s contract. Sending an avatar file publishes a verified
 * immutable `avatarR2Key`, replacing the current identity without deleting the
 * prior image retained in profile history.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import {
  MAX_CONTRIBUTOR_PROFILE_LINKS as MAX_LINKS,
  deriveProfileKeyFromEmail,
  normalizeProfileKey,
  toContributorDisplayName,
} from "@server/contributorProfileIdentity";
import { roleMeetsFloor } from "@/lib/auth/roles";
import { classifyDataRejection } from "@/lib/http/dataRejection";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import type { ServerDataWriteCapability } from "@server/data/serverWriteCapability";
import {
  normalizeAvatarUpload,
  type NormalizedAvatarUpload,
  uploadAvatarToR2,
} from "@server/next/contributorAvatarUpload";
import { revalidateContributorSurfaces } from "./contributorRevalidation";
import { contentHash } from "@server/proposals/contentHash";

export const runtime = "nodejs";

const MAX_PAYLOAD_BYTES = 3 * 1024 * 1024;
const MAX_BIO_LENGTH = 4_000;
const MAX_ALIASES = 32;
const MAX_SHORT_TEXT = 200;
const MAX_URL_LENGTH = 2_000;

type ProfilePatchBody = {
  key?: unknown;
  expectedUpdatedAt?: unknown;
  operationId?: unknown;
  displayName?: unknown;
  bio?: unknown;
  role?: unknown;
  links?: unknown;
  aliases?: unknown;
  membershipEmail?: unknown;
  avatarUrl?: unknown;
  exclude_from_gallery?: unknown;
  archival?: unknown;
  approved_replicator?: unknown;
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
  expectedUpdatedAt: string | null;
  operationId?: string;
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
    approved_replicator?: boolean;
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
 * string means the editor cleared it, which is `null` on the Postgres side. The
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
 * anything else must be a `{ markdown, attribution? }` object. The Postgres
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

function parseProfilePatchBody(raw: ProfilePatchBody): ParsedProfilePatch {
  const key = requireProfileKey(raw.key);
  if (raw.expectedUpdatedAt !== null && typeof raw.expectedUpdatedAt !== "string") {
    throw new JsonBodyError(400, "The expected profile revision must be a timestamp or null.");
  }
  if (raw.operationId !== undefined && (typeof raw.operationId !== "string" || !/^[\w-]{16,100}$/.test(raw.operationId))) {
    throw new JsonBodyError(400, "A valid publication operation ID is required.");
  }
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

  if (raw.approved_replicator !== undefined) {
    if (typeof raw.approved_replicator !== "boolean") {
      throw new JsonBodyError(400, "The approved replicator flag must be a boolean.");
    }
    patch.approved_replicator = raw.approved_replicator;
  }

  if (raw.staffNote !== undefined) {
    patch.staffNote = parseStaffNote(raw.staffNote);
  }

  let avatarUpload: NormalizedAvatarUpload | null;
  try {
    avatarUpload = normalizeAvatarUpload(raw.avatarUpload);
  } catch (error) {
    throw new JsonBodyError(400, error instanceof Error ? error.message : "Invalid avatar upload.");
  }

  return {
    key,
    expectedUpdatedAt: raw.expectedUpdatedAt as string | null,
    operationId: raw.operationId as string | undefined,
    patch,
    avatarUpload,
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

function adminIntentToken(dataWrite: ServerDataWriteCapability): string {
  return dataWrite.getAdminIntentToken?.("profileMediaWrite") ?? dataWrite.adminKey;
}

/**
 * The key a signed-in user may treat as their own: the record whose membership
 * email is theirs, or else the key their email derives to. The derived key is
 * a claim, not a title: the GET still refuses it when someone else's sign-in
 * already holds that record, and `saveProfile` refuses the write.
 */
async function resolveOwnProfileKey(
  dataWrite: ServerDataWriteCapability,
  actorEmail: string,
): Promise<string> {
  const owned = await dataWrite.client.query(api.contributorProfiles.getOwnedProfile, {
    apiKey: adminIntentToken(dataWrite),
    email: actorEmail,
  });
  return owned?.key ?? deriveProfileKeyFromEmail(actorEmail);
}

/** The record a first save creates: the self key, a name to start from, nothing else. */
function blankOwnProfile(key: string) {
  return {
    key,
    displayName: toContributorDisplayName(key),
    aliases: [] as string[],
    bio: "",
    role: null,
    links: [] as Array<{ label: string; url: string }>,
    membershipEmail: null,
    avatarUrl: null,
    avatarStorageId: null,
    avatarR2Key: null,
    storedAvatarUrl: null,
    replicationOrder: [] as string[],
    reportOrder: [] as string[],
    exclude_from_gallery: false,
    archival: false,
    approved_replicator: false,
    staffNote: null,
    updatedAt: null,
    updatedBy: null,
  };
}

const OWN_RECORD_ONLY = { error: "You can only view your own contributor profile." };
const OWN_RECORD_WRITE_ONLY = { error: "You can only edit your own contributor profile." };

export const GET = protectedRouteOperation({
  auth: "contributor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load a contributor profile via Next route:",
  unexpectedErrorMessage: "Unable to load that contributor right now.",
  operation: async ({ auth, actorEmail, dataWrite, request }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey = adminIntentToken(dataWrite);
    const requestedKey = new URL(request.url).searchParams.get("key")?.trim() ?? "";
    if (!requestedKey) {
      return NextResponse.json(
        { error: "A contributor profile key is required." },
        { status: 400 },
      );
    }

    const isEditor = roleMeetsFloor(auth.role, "editor");
    // Resolved before any record is read, so a non-editor never fetches a
    // record that is not theirs.
    const ownKey = isEditor ? null : await resolveOwnProfileKey(dataWrite, actorEmail);
    if (ownKey !== null && normalizeProfileKey(requestedKey) !== ownKey) {
      return NextResponse.json(OWN_RECORD_ONLY, { status: 403 });
    }

    // Editors read as themselves for Postgres's editor check. A non-editor's own
    // record is read with the server token alone: ownership was settled above
    // and the editor projection would refuse their membership role.
    const profile = await dataWrite.client.query(api.contributorProfiles.getEditorProfile, {
      apiKey,
      ...(isEditor ? { actorEmail } : {}),
      key: ownKey ?? requestedKey,
    });

    if (
      ownKey !== null &&
      profile?.membershipEmail &&
      profile.membershipEmail.trim().toLowerCase() !== actorEmail.trim().toLowerCase()
    ) {
      // The derived key lands on a record another sign-in already claimed.
      return NextResponse.json(OWN_RECORD_ONLY, { status: 403 });
    }

    if (!profile) {
      const selfKey = ownKey ?? (await resolveOwnProfileKey(dataWrite, actorEmail));
      if (normalizeProfileKey(requestedKey) !== selfKey) {
        return NextResponse.json(
          { error: `No contributor profile for "${requestedKey}".` },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, profile: blankOwnProfile(selfKey), works: [], reports: [] });
    }
    if (new URL(request.url).searchParams.get("contextual") === "true") {
      const owner = await resolveOwnProfileKey(dataWrite, actorEmail);
      const canEdit = auth.role === "admin" || normalizeProfileKey(profile.key) === owner;
      if (!canEdit) return NextResponse.json(OWN_RECORD_ONLY, { status: 403 });
      return NextResponse.json({
        ok: true,
        profile: { ...profile, membershipEmail: null, staffNote: null },
        works: [],
        reports: [],
      }, { headers: { "Cache-Control": "private, no-store" } });
    }

    // The same name set the public gallery matches on: display name plus every
    // stored alias. Matching narrower here would show the editor a different
    // list from the one their saved ordering actually reorders.
    const artistNames = [profile.displayName, ...profile.aliases].filter(Boolean);

    const [works, reports] = await Promise.all([
      dataWrite.client.query(api.replications.getByArtistNames, { artistNames }),
      dataWrite.client.query(api.tripReports.getByContributor, {
        profileKey: profile.key,
        authorNames: artistNames.map((name) => name.toLowerCase()),
      }),
    ]);

    return NextResponse.json({
      ok: true,
      // Staff commentary and the membership link are editor-only facts.
      profile: isEditor ? profile : { ...profile, membershipEmail: null, staffNote: null },
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
  auth: "contributor",
  rateLimit: "authenticatedProfileWrite",
  body: {
    maxBytes: MAX_PAYLOAD_BYTES,
    parse: parseProfilePatchBody,
  },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to save a contributor profile via Next route:",
  unexpectedErrorMessage: "Unable to save that contributor profile right now.",
  mapError: (error) => {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const rejection = classifyDataRejection(error);
    if (rejection?.code === "PROFILE_CONFLICT") {
      return NextResponse.json({ error: rejection.message, code: rejection.code }, { status: 409 });
    }
    if (rejection?.code === "ADMIN_ONLY_PROFILE_FIELD") {
      return NextResponse.json({ error: rejection.message, code: rejection.code }, { status: 403 });
    }
    // Postgres wraps thrown mutation errors, so match by substring.
    const message = error instanceof Error ? error.message : "";
    if (message.includes("You can only edit your own contributor profile")) {
      return NextResponse.json(OWN_RECORD_WRITE_ONLY, { status: 403 });
    }
    return null;
  },
  operation: async ({ auth, actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey = adminIntentToken(dataWrite);
    const isEditor = roleMeetsFloor(auth.role, "editor");
    const clientRequestIdentity = contentHash({
      key: normalizeProfileKey(body.key),
      expectedUpdatedAt: body.expectedUpdatedAt,
      patch: body.patch,
      avatarUpload: body.avatarUpload,
    });
    if (body.operationId) {
      const receipt = await dataWrite.client.query(api.contributorProfiles.getPublicationReceipt, {
        apiKey, actorEmail, key: body.key, operationId: body.operationId, clientRequestIdentity,
      });
      if (receipt) {
        await revalidateContributorSurfaces({ contributorKeys: receipt.revalidate.contributorKeys, scope: "profile", galleryVisibilityChanged: body.patch.exclude_from_gallery !== undefined });
        return NextResponse.json({ ok: true, profile: receipt.profile, revision: receipt.revision });
      }
    }

    // An editor patches a stored record they own. A non-editor, or an editor
    // whose own record does not exist yet, writes the self-serve field set
    // through `saveProfile`, which enforces ownership with the actor's real
    // role and creates the record on first save. Admin-only fields in a
    // self-serve body are never written.
    const stored = isEditor
      ? await dataWrite.client.query(api.contributorProfiles.getEditorProfile, {
          apiKey,
          actorEmail,
          key: body.key,
        })
      : null;
    if (
      stored?.membershipEmail &&
      auth.role !== "admin" &&
      stored.membershipEmail.trim().toLowerCase() !== actorEmail.trim().toLowerCase()
    ) {
      return NextResponse.json(OWN_RECORD_WRITE_ONLY, { status: 403 });
    }
    const selfServe = !isEditor || !stored;
    if (selfServe && isEditor) {
      const ownKey = await resolveOwnProfileKey(dataWrite, actorEmail);
      if (normalizeProfileKey(body.key) !== ownKey) {
        return NextResponse.json(
          { error: `No contributor profile for "${body.key}".` },
          { status: 404 },
        );
      }
    }

    const avatarUpload = body.avatarUpload
      ? await uploadAvatarToR2(body.avatarUpload, dataWrite, actorEmail, {
          key: body.key,
          expectedUpdatedAt: body.expectedUpdatedAt,
          selfServe,
          patch: body.patch,
        })
      : undefined;
    const avatarR2Key = avatarUpload?.r2Key;

    const result = selfServe
      ? await dataWrite.client.mutation(api.contributorProfiles.saveProfile, {
          apiKey,
          actorEmail,
          expectedUpdatedAt: body.expectedUpdatedAt,
          operationId: body.operationId,
          clientRequestIdentity,
          avatarR2Receipt: avatarUpload?.receipt,
          profile: {
            key: body.key,
            displayName: body.patch.displayName ?? "",
            bio: body.patch.bio ?? "",
            links: body.patch.links ?? [],
            // An uploaded file wins; otherwise `null` clears the remote URL,
            // a string replaces it, and an omitted field keeps the stored one.
            avatarUrl: avatarR2Key ? undefined : body.patch.avatarUrl,
            avatarR2Key,
          },
        })
      : await dataWrite.client.mutation(api.contributorProfiles.saveProfileAsEditor, {
          apiKey,
          actorEmail,
          key: body.key,
          expectedUpdatedAt: body.expectedUpdatedAt,
          operationId: body.operationId,
          clientRequestIdentity,
          avatarR2Receipt: avatarUpload?.receipt,
          patch: {
            ...body.patch,
            ...(avatarR2Key ? { avatarR2Key } : {}),
          },
        });

    await revalidateContributorSurfaces({
      contributorKeys: result.revalidate?.contributorKeys ?? [body.key],
      scope: "profile",
      // The /replications gallery corpus filters on this flag, so flipping it
      // must land there on the next request, not at the end of the cache window.
      galleryVisibilityChanged: body.patch.exclude_from_gallery !== undefined,
    });

    return NextResponse.json({ ok: true, profile: result.profile, revision: result.revision });
  },
});
