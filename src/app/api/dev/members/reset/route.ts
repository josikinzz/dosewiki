import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { MEMBER_BODY_MAX_BYTES, parseMemberEmail, type MemberActionBody } from "../memberRoutes";

export const runtime = "nodejs";

const RESET_PAGE_PATH = "/reset-password";

export const POST = protectedRouteOperation<MemberActionBody, { email: string }>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: MEMBER_BODY_MAX_BYTES, parse: parseMemberEmail },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to issue a password reset via Next route:",
  unexpectedErrorMessage: "Unable to issue a password reset right now.",
  operation: async ({ actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");

    await dataWrite.client.mutation(api.memberships.issuePasswordReset, {
      apiKey: dataWrite.adminKey,
      actorEmail,
      email: body.email,
      tokenHash,
    });

    return NextResponse.json({
      ok: true,
      email: body.email,
      resetPath: `${RESET_PAGE_PATH}?token=${token}`,
    });
  },
});
