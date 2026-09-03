/**
 * POST /api/dev/invites/[id]/revoke → { ok }
 *
 * Admin only. A fully redeemed code cannot be revoked (Convex refuses with
 * `INVITE_EXHAUSTED`); revoking an already revoked code is a no-op.
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

const REVOKE_PATH = /\/api\/dev\/invites\/([^/]+)\/revoke\/?$/;

export const POST = protectedRouteOperation({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to revoke an invite code via Next route:",
  unexpectedErrorMessage: "Unable to revoke the invite code right now.",
  operation: async ({ request, actorEmail, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const match = REVOKE_PATH.exec(new URL(request.url).pathname);
    const id = match ? decodeURIComponent(match[1]) : "";
    if (!id) {
      return NextResponse.json({ error: "An invite code id is required." }, { status: 400 });
    }

    await convexWrite.client.mutation(api.inviteCodes.revoke, {
      apiKey: convexWrite.adminKey,
      actorEmail,
      id: id as Id<"inviteCodes">,
    });

    return NextResponse.json({ ok: true });
  },
});
