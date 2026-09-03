/**
 * Admin write endpoint for one copy block (the /dev Copy Studio).
 *
 *   POST   /api/dev/copy-block   { key, kind, label, group, flavor?, body?, items? }
 *   DELETE /api/dev/copy-block   { key }   → revert the key to its local default
 *
 * Both verbs are admin only: an editor's Copy Studio save goes through
 * `POST /api/dev/proposals` as a `copyBlocks` proposal instead, and reaches
 * `copyBlocks.upsert` only when an admin approves it. The browser holds no
 * admin intent token, so the write is delegated here: the route checks the
 * admin session, then calls Convex with the server's own token plus the
 * actor's email for the audit trail.
 *
 * Both verbs finish by revalidating `PUBLIC_CONVEX_CACHE_TAGS.copy` with
 * `expire: 0`, which is what makes an edit show up on the public pages
 * immediately instead of at the end of the 15-minute public-data window.
 * Deleting is not destructive: the server read helper falls back to the
 * checked-in default in `src/data/content/copyBlocks.json`, so a removed row
 * renders the original hardcoded prose.
 */
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { api } from "../../../../../convex/_generated/api";
import { PUBLIC_CONVEX_CACHE_TAGS } from "@server/convex/publicData";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import {
  parseCopyBlockBody,
  requireCopyBlockKey,
  type CopyBlockBody,
  type ParsedCopyBlock,
} from "./parseCopyBlockBody";

export const runtime = "nodejs";

export const POST = protectedRouteOperation<CopyBlockBody, ParsedCopyBlock>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 64 * 1024,
    parse: parseCopyBlockBody,
  },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to save a copy block via Next route:",
  unexpectedErrorMessage: "Unable to save that copy block right now.",
  operation: async ({ actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey =
      convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;

    const result = await convexWrite.client.mutation(api.copyBlocks.upsert, {
      apiKey,
      actorEmail,
      key: body.key,
      flavor: body.flavor,
      kind: body.kind,
      body: body.body,
      items: body.items,
      label: body.label,
      group: body.group,
      updatedBy: actorEmail,
    });

    revalidateTag(PUBLIC_CONVEX_CACHE_TAGS.copy, { expire: 0 });

    return NextResponse.json({ ok: true, key: result.key, updated: result.updated });
  },
});

export const DELETE = protectedRouteOperation<{ key?: unknown }, string>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 4 * 1024,
    parse: (raw) => requireCopyBlockKey(raw?.key),
  },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to reset a copy block via Next route:",
  unexpectedErrorMessage: "Unable to reset that copy block right now.",
  operation: async ({ actorEmail, body: key, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey =
      convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;

    const result = await convexWrite.client.mutation(api.copyBlocks.remove, {
      apiKey,
      actorEmail,
      key,
    });

    revalidateTag(PUBLIC_CONVEX_CACHE_TAGS.copy, { expire: 0 });

    return NextResponse.json({ ok: true, key: result.key, removed: result.removed });
  },
});
