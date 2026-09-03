/**
 * Mints a Convex storage upload URL for the Replication Studio's drop tray.
 *
 * The bytes never pass through Next: the browser PUTs the file straight at the
 * short-lived URL Convex hands back and then posts the resulting storage id to
 * `/api/dev/replications` to create the row — the same two-step the import
 * scripts under `scripts/replications/` use, minus the file system.
 *
 *   POST /api/dev/replications/upload-url → { uploadUrl }
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

export const POST = protectedRouteOperation({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to mint a replication upload URL via Next route:",
  unexpectedErrorMessage: "Unable to start that upload right now.",
  operation: async ({ actorEmail, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey = convexWrite.getAdminIntentToken?.("replicationMaintenance") ?? convexWrite.adminKey;
    const uploadUrl = await convexWrite.client.mutation(api.replications.generateUploadUrl, {
      apiKey,
      actorEmail,
    });

    return NextResponse.json({ ok: true, uploadUrl });
  },
});
