import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { api } from "../../../../convex/_generated/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { PUBLIC_CONVEX_CACHE_TAGS } from "@server/convex/publicData";
import { invalidatePublicDerivedDataCache } from "@server/convex/publicLibrary";
import {
  normalizeAvatarUpload,
  uploadAvatarToConvex,
  type NormalizedAvatarUpload,
} from "@server/next/contributorAvatarUpload";
import { getPublicRoutePath } from "@server/next/publicSite";

export const runtime = "nodejs";

const MAX_PROFILE_PAYLOAD_BYTES = 3 * 1024 * 1024;

type ProfileBody = {
  key?: unknown;
  displayName?: unknown;
  bio?: unknown;
  links?: unknown;
  avatarUrl?: unknown;
};

type SaveProfileBody = {
  profile?: ProfileBody;
  avatarUpload?: {
    filename?: unknown;
    mimeType?: unknown;
    base64?: unknown;
  };
};

function normalizeLinks(value: unknown): Array<{ label: string; url: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is { label?: unknown; url?: unknown } => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      label: typeof entry.label === "string" ? entry.label : "",
      url: typeof entry.url === "string" ? entry.url : "",
    }));
}

type ParsedSaveProfileBody = {
  rawProfile: ProfileBody;
  avatarUpload: NormalizedAvatarUpload | null;
};

function parseProfileBody(body: SaveProfileBody): ParsedSaveProfileBody {
  const rawProfile = body.profile;
  if (!rawProfile || typeof rawProfile !== "object") {
    throw new JsonBodyError(400, "Profile payload is required.");
  }

  return {
    rawProfile,
    avatarUpload: normalizeAvatarUpload(body.avatarUpload),
  };
}

export const POST = protectedRouteOperation<SaveProfileBody, ParsedSaveProfileBody>({
  auth: "authenticated",
  rateLimit: "authenticatedProfileWrite",
  body: {
    maxBytes: MAX_PROFILE_PAYLOAD_BYTES,
    parse: parseProfileBody,
  },
  capabilities: [
    {
      type: "convexWrite",
      errorMessage: (failure) =>
        failure.missing.includes("adminKey")
          ? "Convex admin key is not configured on the server. Set CONVEX_ADMIN_KEY in the deployment environment."
          : failure.message,
    },
  ],
  unexpectedErrorLabel: "Failed to save user profile via Next route:",
  unexpectedErrorMessage: "Unable to save profile right now.",
  mapError: (error) => {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Unable to save profile right now.";
    // Convex wraps thrown mutation errors (prefix/suffix formatting), so match
    // by substring rather than exact equality.
    if (message.includes("You can only edit your own contributor profile")) {
      return NextResponse.json(
        { error: "You can only edit your own contributor profile." },
        { status: 403 },
      );
    }

    if (message.includes("required") || message.includes("must be")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return null;
  },
  operation: async ({ actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const { rawProfile, avatarUpload } = body;
    const avatarStorageId = avatarUpload
      ? await uploadAvatarToConvex(avatarUpload, convexWrite, actorEmail)
      : undefined;
    const apiKey = convexWrite.getAdminIntentToken?.("profileMediaWrite") ?? convexWrite.adminKey;

    const result = await convexWrite.client.mutation(api.contributorProfiles.saveProfile, {
      apiKey,
      actorEmail,
      profile: {
        key: typeof rawProfile.key === "string" ? rawProfile.key : "",
        displayName: typeof rawProfile.displayName === "string" ? rawProfile.displayName : "",
        bio: typeof rawProfile.bio === "string" ? rawProfile.bio : "",
        links: normalizeLinks(rawProfile.links),
        avatarUrl:
          avatarStorageId === undefined
            ? rawProfile.avatarUrl === null
              ? null
              : typeof rawProfile.avatarUrl === "string"
                ? rawProfile.avatarUrl
                : undefined
            : undefined,
        avatarStorageId,
      },
    });

    if (!result.profile) {
      throw new Error("Profile save did not return profile data.");
    }

    const contributorKeys = result.revalidate?.contributorKeys?.length
      ? result.revalidate.contributorKeys
      : [result.profile.key];

    for (const key of contributorKeys) {
      revalidatePath(getPublicRoutePath({ family: "contributor", params: { profileKey: key } }));
    }
    // The saved profile decorates its Artist Page (T-4: avatar, bio, links on
    // /replications/artist/<key>), so edits must land there too; the small,
    // hourly-cached family revalidates as one segment.
    revalidatePath("/replications/artist/[key]", "page");
    revalidatePath("/about");
    invalidatePublicDerivedDataCache({ source: "save-user-profile" });
    revalidateTag(PUBLIC_CONVEX_CACHE_TAGS.all, { expire: 0 });

    return NextResponse.json({
      success: true,
      profile: result.profile,
    });
  },
});
