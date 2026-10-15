import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import {
  deriveProfileKeyFromEmail,
  normalizeProfileKey,
  toContributorDisplayName,
} from "@server/contributorProfileIdentity";
import { roleMeetsFloor } from "@/lib/auth/roles";
import { classifyDataRejection } from "@/lib/http/dataRejection";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import type { ServerDataWriteCapability } from "@server/data/serverWriteCapability";
import { uploadAvatarToR2 } from "@server/next/contributorAvatarUpload";
import { revalidateContributorSurfaces } from "./contributorRevalidation";
import {
  parseProfilePatchBody,
  type ParsedProfilePatch,
  type ProfilePatchBody,
} from "./profilePatchBody";
import { contentHash } from "@server/proposals/contentHash";

export const runtime = "nodejs";

const MAX_PAYLOAD_BYTES = 3 * 1024 * 1024;

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
    const ownKey = isEditor ? null : await resolveOwnProfileKey(dataWrite, actorEmail);
    if (ownKey !== null && normalizeProfileKey(requestedKey) !== ownKey) {
      return NextResponse.json(OWN_RECORD_ONLY, { status: 403 });
    }

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
      galleryVisibilityChanged: body.patch.exclude_from_gallery !== undefined,
    });

    return NextResponse.json({ ok: true, profile: result.profile, revision: result.revision });
  },
});
