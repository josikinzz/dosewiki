/**
 * The destructive third of the Contributors tab: merge, delete, retarget.
 *
 *   POST /api/dev/contributor-profile/danger
 *     { action: "merge",    fromKey, toKey, confirmKey, discardSourceContent? }
 *     { action: "delete",   key, confirmKey }
 *     { action: "retarget", authorName, contributorKey, confirmKey, embeddedAuthorName? }
 *
 * These three were script-only until now, and each rewrites identity rather
 * than content: a merge and a delete remove a row that bylines resolve through,
 * and a retarget re-points existing reports at a different person. None has an
 * undo, so every one requires `confirmKey` to be typed to match the profile
 * that is about to change — the source of a merge, the profile being deleted,
 * the contributor being credited. The check lives here as well as in the UI
 * because a confirmation that only exists in the browser is not a confirmation,
 * and the Convex mutations see only intent flags.
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { revalidateContributorSurfaces } from "../contributorRevalidation";

export const runtime = "nodejs";

const MAX_SHORT_TEXT = 200;

type DangerBody = {
  action?: unknown;
  key?: unknown;
  fromKey?: unknown;
  toKey?: unknown;
  authorName?: unknown;
  contributorKey?: unknown;
  embeddedAuthorName?: unknown;
  confirmKey?: unknown;
  discardSourceContent?: unknown;
};

type ParsedDanger =
  | { action: "merge"; fromKey: string; toKey: string; discardSourceContent: boolean }
  | { action: "delete"; key: string }
  | { action: "retarget"; authorName: string; contributorKey: string; embeddedAuthorName?: string };

function requireText(raw: unknown, label: string): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value || value.length > MAX_SHORT_TEXT) {
    throw new JsonBodyError(400, `${label} is required.`);
  }
  return value;
}

/**
 * The typed confirmation. Compared case-insensitively because profile keys are
 * normalized to upper case on the Convex side, and a correct answer in the
 * wrong case is not a different answer.
 */
function requireConfirmation(raw: unknown, expected: string, label: string): void {
  const typed = typeof raw === "string" ? raw.trim() : "";
  if (typed.toLowerCase() !== expected.trim().toLowerCase()) {
    throw new JsonBodyError(400, `Type "${expected}" to confirm ${label}.`);
  }
}

export function parseDangerBody(raw: DangerBody): ParsedDanger {
  const action = raw.action;

  if (action === "merge") {
    const fromKey = requireText(raw.fromKey, "The source profile key");
    const toKey = requireText(raw.toKey, "The destination profile key");
    requireConfirmation(raw.confirmKey, fromKey, "this merge");
    return {
      action: "merge",
      fromKey,
      toKey,
      discardSourceContent: raw.discardSourceContent === true,
    };
  }

  if (action === "delete") {
    const key = requireText(raw.key, "The profile key");
    requireConfirmation(raw.confirmKey, key, "this deletion");
    return { action: "delete", key };
  }

  if (action === "retarget") {
    const authorName = requireText(raw.authorName, "The byline to retarget");
    const contributorKey = requireText(raw.contributorKey, "The destination profile key");
    requireConfirmation(raw.confirmKey, contributorKey, "this retarget");
    const embeddedAuthorName =
      typeof raw.embeddedAuthorName === "string" && raw.embeddedAuthorName.trim()
        ? raw.embeddedAuthorName.trim()
        : undefined;
    return { action: "retarget", authorName, contributorKey, embeddedAuthorName };
  }

  throw new JsonBodyError(400, "Unknown contributor action.");
}

export const POST = protectedRouteOperation<DangerBody, ParsedDanger>({
  auth: "editor",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 8 * 1024,
    parse: parseDangerBody,
  },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to run a contributor identity operation via Next route:",
  unexpectedErrorMessage: "Unable to complete that contributor operation right now.",
  operation: async ({ actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey = convexWrite.getAdminIntentToken?.("profileMediaWrite") ?? convexWrite.adminKey;

    if (body.action === "merge") {
      const result = await convexWrite.client.mutation(api.contributorProfiles.mergeProfileInto, {
        apiKey,
        fromKey: body.fromKey,
        toKey: body.toKey,
        discardSourceContent: body.discardSourceContent,
      });

      revalidateContributorSurfaces({
        contributorKeys: result.revalidate?.contributorKeys ?? [body.fromKey, body.toKey],
        scope: "attribution",
      });

      return NextResponse.json({
        ok: true,
        action: "merge",
        mergedFrom: result.mergedFrom,
        mergedInto: result.mergedInto,
        reportsUpdated: result.reportsUpdated,
        aliases: result.aliases,
      });
    }

    if (body.action === "delete") {
      const result = await convexWrite.client.mutation(api.contributorProfiles.deleteProfile, {
        apiKey,
        key: body.key,
        confirmDelete: true,
      });

      revalidateContributorSurfaces({
        contributorKeys: [result.key, ...result.aliasesRemoved],
        scope: "attribution",
      });

      return NextResponse.json({
        ok: true,
        action: "delete",
        key: result.key,
        displayName: result.displayName,
      });
    }

    const result = await convexWrite.client.mutation(
      api.contributorProfiles.retargetTripReportsToContributor,
      {
        apiKey,
        actorEmail,
        authorName: body.authorName,
        contributorKey: body.contributorKey,
        ...(body.embeddedAuthorName ? { embeddedAuthorName: body.embeddedAuthorName } : {}),
      },
    );

    revalidateContributorSurfaces({
      contributorKeys: result.revalidate?.contributorKeys ?? [body.contributorKey],
      scope: "attribution",
    });

    return NextResponse.json({
      ok: true,
      action: "retarget",
      reportsUpdated: result.reportsUpdated,
    });
  },
});
