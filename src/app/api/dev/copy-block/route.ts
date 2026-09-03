/**
 * Editor write endpoint for one copy block (the /dev Copy Studio).
 *
 *   POST   /api/dev/copy-block   { key, kind, label, group, flavor?, body?, items? }
 *   DELETE /api/dev/copy-block   { key }   → revert the key to its local default (admin)
 *
 * The browser holds no admin intent token, so the write is delegated here: the
 * route checks the editor session (admin for DELETE), then calls `copyBlocks.upsert` with the
 * server's own token plus the actor's email for the audit trail.
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
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const COPY_BLOCK_KINDS = ["markdown", "plain", "list"] as const;

/** Matches the Convex-side ceilings in `convex/copyBlocks.ts`. */
const BODY_MAX_LENGTH = 20_000;
const ITEM_MAX_LENGTH = 2_000;
const MAX_ITEMS = 64;
const LABEL_MAX_LENGTH = 120;

type CopyBlockKind = (typeof COPY_BLOCK_KINDS)[number];

type CopyBlockBody = {
  key?: unknown;
  flavor?: unknown;
  kind?: unknown;
  body?: unknown;
  items?: unknown;
  label?: unknown;
  group?: unknown;
};

type ParsedCopyBlock = {
  key: string;
  flavor?: string;
  kind: CopyBlockKind;
  body?: string;
  items?: string[];
  label: string;
  group: string;
};

function requireKey(raw: unknown): string {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!KEY_PATTERN.test(key)) {
    throw new JsonBodyError(400, "A valid lower-case copy block key is required.");
  }
  return key;
}

function requireShortText(raw: unknown, label: string): string {
  if (typeof raw !== "string") {
    throw new JsonBodyError(400, `${label} must be a string.`);
  }
  const value = raw.trim();
  if (!value) {
    throw new JsonBodyError(400, `${label} is required.`);
  }
  if (value.length > LABEL_MAX_LENGTH) {
    throw new JsonBodyError(400, `${label} must be ${LABEL_MAX_LENGTH} characters or fewer.`);
  }
  return value;
}

function parseCopyBlockBody(raw: CopyBlockBody): ParsedCopyBlock {
  const key = requireKey(raw.key);

  const kind = raw.kind;
  if (typeof kind !== "string" || !(COPY_BLOCK_KINDS as readonly string[]).includes(kind)) {
    throw new JsonBodyError(400, "A copy block must be markdown, plain, or list.");
  }

  const parsed: ParsedCopyBlock = {
    key,
    kind: kind as CopyBlockKind,
    label: requireShortText(raw.label, "The label"),
    group: requireShortText(raw.group, "The group"),
  };

  if (typeof raw.flavor === "string" && raw.flavor.trim()) {
    parsed.flavor = raw.flavor.trim();
  }

  if (parsed.kind === "list") {
    if (!Array.isArray(raw.items)) {
      throw new JsonBodyError(400, "A list copy block needs an array of items.");
    }
    if (raw.items.length > MAX_ITEMS) {
      throw new JsonBodyError(400, `A list copy block may hold at most ${MAX_ITEMS} items.`);
    }
    parsed.items = raw.items.map((item) => {
      if (typeof item !== "string") {
        throw new JsonBodyError(400, "Each list item must be a string.");
      }
      if (item.length > ITEM_MAX_LENGTH) {
        throw new JsonBodyError(
          400,
          `Each list item must be ${ITEM_MAX_LENGTH} characters or fewer.`,
        );
      }
      return item;
    });
    return parsed;
  }

  if (typeof raw.body !== "string") {
    throw new JsonBodyError(400, "A markdown or plain copy block needs body text.");
  }
  if (raw.body.length > BODY_MAX_LENGTH) {
    throw new JsonBodyError(400, `A copy block must be ${BODY_MAX_LENGTH} characters or fewer.`);
  }
  parsed.body = raw.body;

  return parsed;
}

export const POST = protectedRouteOperation<CopyBlockBody, ParsedCopyBlock>({
  auth: "editor",
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
    parse: (raw) => requireKey(raw?.key),
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
