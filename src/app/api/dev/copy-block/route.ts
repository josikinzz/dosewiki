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
 * admin session, then calls Postgres with the server's own token plus the
 * actor's email for the audit trail.
 *
 * Both verbs finish by publishing the `copy` content identity through the
 * shared publication seam, which expires `PUBLIC_DATA_CACHE_TAGS.copy` here
 * and delivers the same identity to the public deployments. That is what makes
 * an edit show up on the public pages immediately instead of at the end of the
 * 15-minute public-data window.
 * Deleting is not destructive: the server read helper falls back to the
 * checked-in default in `content/copy-blocks/copyBlocks.json`, so a removed row
 * renders the original hardcoded prose.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { parseCopyIndexPublicationInput, type CopyIndexPublicationInput } from "../copyIndexPublicationInput";
import {
  parseCopyBlockBody,
  requireCopyBlockKey,
  type CopyBlockBody,
  type ParsedCopyBlock,
} from "./parseCopyBlockBody";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "editor", rateLimit: "diagnosticRead", capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load shared copy source:", unexpectedErrorMessage: "The shared copy editing source could not be loaded.",
  operation: async ({ request, actorEmail, dataWrite }) => {
    const key = new URL(request.url).searchParams.get("key") ?? "";
    if (!/^[a-z0-9][a-z0-9-]*$/.test(key) || key.length > 200) throw new JsonBodyError(400, "A valid copy key is required.");
    return NextResponse.json(await dataWrite!.client.query(api.copyBlocks.getForEditor, {
      key, apiKey: dataWrite!.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite!.adminKey, actorEmail,
    }));
  },
});

export const POST = protectedRouteOperation<CopyBlockBody & { expected?: unknown; expectedRevision?: unknown; operationId?: unknown }, ParsedCopyBlock & { expected: unknown } & CopyIndexPublicationInput>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 64 * 1024,
    parse: (raw) => {
      if (!Object.prototype.hasOwnProperty.call(raw, "expected")) throw new JsonBodyError(400, "A loaded copy baseline is required.");
      return { ...parseCopyBlockBody(raw), expected: raw.expected, ...parseCopyIndexPublicationInput(raw) };
    },
  },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to save a copy block via Next route:",
  unexpectedErrorMessage: "Unable to save that copy block right now.",
  operation: async ({ actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey =
      dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;

    const result = await dataWrite.client.mutation(api.copyBlocks.upsert, {
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
      expected: body.expected,
      expectedRevision: body.expectedRevision, operationId: body.operationId,
    });

    await publishPublicCache({ targets: [{ kind: "copy" }], source: "manual" });

    return NextResponse.json({ ok: true, key: result.key, updated: result.updated, revision: result.revision, replayed: result.replayed, unchanged: result.unchanged });
  },
});

export const DELETE = protectedRouteOperation<{ key?: unknown; expected?: unknown; expectedRevision?: unknown; operationId?: unknown }, { key: string; expected: unknown } & CopyIndexPublicationInput>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 4 * 1024,
    parse: (raw) => {
      if (!Object.prototype.hasOwnProperty.call(raw, "expected")) throw new JsonBodyError(400, "A loaded copy baseline is required.");
      return { key: requireCopyBlockKey(raw.key), expected: raw.expected, ...parseCopyIndexPublicationInput(raw) };
    },
  },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to reset a copy block via Next route:",
  unexpectedErrorMessage: "Unable to reset that copy block right now.",
  operation: async ({ actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey =
      dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;

    const result = await dataWrite.client.mutation(api.copyBlocks.remove, {
      apiKey,
      actorEmail,
      key: body.key,
      expected: body.expected,
      expectedRevision: body.expectedRevision, operationId: body.operationId,
    });

    await publishPublicCache({ targets: [{ kind: "copy" }], source: "manual" });

    return NextResponse.json({ ok: true, key: result.key, removed: result.removed, revision: result.revision, replayed: result.replayed, unchanged: result.unchanged });
  },
});
