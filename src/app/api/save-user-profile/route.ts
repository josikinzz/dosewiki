import { Buffer } from "node:buffer";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { api } from "../../../../convex/_generated/api";
import { deriveProfileKeyFromEmail } from "@/data/userProfiles";
import { requireAuthenticatedSession } from "@/lib/auth/requireAuthenticatedSession";
import { readJsonBody, JsonBodyError } from "@/lib/http/readJsonBody";
import { enforceRateLimit } from "@server/http/nextRateLimit";
import { getServerConvexWriteClient } from "@server/convex/serverClient";
import { getServerConvexAdminKey } from "@server/convex/serverWriteHealth";

export const runtime = "nodejs";

const MAX_PROFILE_PAYLOAD_BYTES = 3 * 1024 * 1024;
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

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

type NormalizedAvatarUpload = {
  mimeType: string;
  base64: string;
};

function normalizeProfileKey(value: unknown, email: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim().toUpperCase();
  }

  return deriveProfileKeyFromEmail(email);
}

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

function normalizeAvatarUpload(value: SaveProfileBody["avatarUpload"]): NormalizedAvatarUpload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const mimeType = typeof value.mimeType === "string" ? value.mimeType.trim().toLowerCase() : "";
  const base64 = typeof value.base64 === "string" ? value.base64.trim().replace(/^data:[^;]+;base64,/, "") : "";

  if (!mimeType || !ALLOWED_AVATAR_MIME_TYPES.has(mimeType)) {
    throw new Error("Avatar must be a PNG, JPG, or WebP image.");
  }

  if (!base64) {
    throw new Error("Avatar image data is required.");
  }

  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength === 0) {
    throw new Error("Avatar image data is empty.");
  }

  if (bytes.byteLength > MAX_AVATAR_SIZE_BYTES) {
    throw new Error("Avatar image must be 2 MB or smaller.");
  }

  return {
    mimeType,
    base64,
  };
}

async function uploadAvatarToConvex(upload: NormalizedAvatarUpload, adminKey: string): Promise<string> {
  const client = getServerConvexWriteClient();
  const uploadUrl = await client.mutation(api.contributorProfiles.generateAvatarUploadUrl, {
    apiKey: adminKey,
  });

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": upload.mimeType,
    },
    body: Buffer.from(upload.base64, "base64"),
  });

  const uploadResult = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok) {
    throw new Error("Avatar upload failed.");
  }

  const storageId =
    typeof uploadResult.storageId === "string"
      ? uploadResult.storageId
      : typeof uploadResult.id === "string"
        ? uploadResult.id
        : null;

  if (!storageId) {
    throw new Error("Avatar upload did not return a storage id.");
  }

  return storageId;
}

export async function POST(request: Request) {
  const rateLimited = await enforceRateLimit(request, { windowMs: 60_000, max: 5 });
  if (rateLimited) {
    return rateLimited;
  }

  const auth = await requireAuthenticatedSession();
  if (auth.ok === false) {
    return auth.response;
  }

  const adminKey = getServerConvexAdminKey();
  if (!adminKey) {
    return NextResponse.json(
      {
        error:
          "Convex admin key is not configured on the server. Set CONVEX_ADMIN_KEY in the deployment environment.",
      },
      { status: 500 },
    );
  }

  try {
    const body = await readJsonBody<SaveProfileBody>(request, {
      maxBytes: MAX_PROFILE_PAYLOAD_BYTES,
    });

    const rawProfile = body.profile;
    if (!rawProfile || typeof rawProfile !== "object") {
      return NextResponse.json({ error: "Profile payload is required." }, { status: 400 });
    }

    const profileKey = normalizeProfileKey(rawProfile.key, auth.session.user.email);
    const avatarUpload = normalizeAvatarUpload(body.avatarUpload);
    const avatarStorageId = avatarUpload ? await uploadAvatarToConvex(avatarUpload, adminKey) : undefined;

    const result = await getServerConvexWriteClient().mutation(api.contributorProfiles.saveProfile, {
      apiKey: adminKey,
      actorEmail: auth.session.user.email,
      actorRole: auth.role ?? undefined,
      profile: {
        key: profileKey,
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

    revalidatePath(`/contributors/${encodeURIComponent(result.profile.key)}`);
    revalidatePath("/about");

    return NextResponse.json({
      success: true,
      profile: result.profile,
    });
  } catch (error) {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Unable to save profile right now.";
    const status =
      message === "You can only edit your own contributor profile."
        ? 403
        : message.includes("required") || message.includes("must be")
          ? 400
          : 500;

    if (status === 500) {
      console.error("Failed to save user profile via Next route:", error);
    }

    return NextResponse.json({ error: message }, { status });
  }
}
