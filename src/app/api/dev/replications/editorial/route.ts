/**
 * Editorial write endpoint for the Replication Studio (`/dev` → Replications).
 *
 * One verb, two shapes, because the studio has two ways to edit:
 *
 *   POST /api/dev/replications/editorial  { mode: "single", id, expected, updates }
 *   POST /api/dev/replications/editorial  { mode: "bulk", ids, …fields }
 *
 * The single edit carries the snapshot the drawer was opened with so Postgres can
 * refuse a stale save rather than re-assert fields somebody else has since
 * changed; the bulk edit carries only the fields it means to set. Both shapes
 * rewrite the public corpus directly, so the route is admin-only and Postgres
 * enforces the same floor.
 */
import { NextResponse } from "next/server";
import type { PublicationTarget } from "@server/next/publicationWire";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { publishReplicationRecord } from "../publishReplicationRecord";
import { api } from "@server/postgres/runtime/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import {
  isValidReplicationSlug,
  type StudioRole,
} from "@/features/dev/tools/replication-studio/replicationStudioModel";
import type { Id } from "@server/postgres/runtime/dataModel";

export const runtime = "nodejs";

const MAX_PAYLOAD_BYTES = 64 * 1024;
const ROLES = new Set<StudioRole>(["replication", "figure"]);

type EditorialSnapshot = {
  title: string;
  artist: string;
  role: StudioRole;
  effect_slug: string | null;
  credit_line: string | null;
  effect_tags: string[];
};

type ParsedEditorial =
  | { mode: "single"; id: string; expected: EditorialSnapshot; updates: EditorialSnapshot }
  | {
      mode: "bulk";
      ids: string[];
      effectSlug?: string;
      artist?: string;
      role?: StudioRole;
      addEffectTags?: string[];
      showcaseExcluded?: boolean;
    };

function parseTags(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    throw new JsonBodyError(400, `${field} must be a list of effect slugs.`);
  }
  const tags = (value as string[]).map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  if (tags.some((tag) => !isValidReplicationSlug(tag))) {
    throw new JsonBodyError(400, `${field} must be kebab-case effect slugs.`);
  }
  return tags;
}

function parseSnapshot(value: unknown, field: string): EditorialSnapshot {
  if (!value || typeof value !== "object") {
    throw new JsonBodyError(400, `${field} is required.`);
  }
  const raw = value as Record<string, unknown>;

  if (typeof raw.title !== "string" || raw.title.trim().length === 0 || raw.title.length > 400) {
    throw new JsonBodyError(400, `${field}.title is required.`);
  }
  if (typeof raw.artist !== "string" || raw.artist.trim().length === 0 || raw.artist.length > 200) {
    throw new JsonBodyError(400, `${field}.artist is required.`);
  }
  if (typeof raw.role !== "string" || !ROLES.has(raw.role as StudioRole)) {
    throw new JsonBodyError(400, `${field}.role must be replication or figure.`);
  }
  if (raw.effect_slug !== null && (typeof raw.effect_slug !== "string" || !isValidReplicationSlug(raw.effect_slug))) {
    throw new JsonBodyError(400, `${field}.effect_slug must be a kebab-case slug or null.`);
  }
  if (raw.credit_line !== null && (typeof raw.credit_line !== "string" || raw.credit_line.length > 2000)) {
    throw new JsonBodyError(400, `${field}.credit_line must be a string or null.`);
  }

  return {
    title: raw.title,
    artist: raw.artist,
    role: raw.role as StudioRole,
    effect_slug: raw.effect_slug as string | null,
    credit_line: raw.credit_line as string | null,
    effect_tags: parseTags(raw.effect_tags, `${field}.effect_tags`),
  };
}

function parseEditorialBody(body: unknown): ParsedEditorial {
  const raw = (body ?? {}) as Record<string, unknown>;

  if (raw.mode === "single") {
    if (typeof raw.id !== "string" || raw.id.length === 0 || raw.id.length > 200) {
      throw new JsonBodyError(400, "id is required.");
    }
    return {
      mode: "single",
      id: raw.id,
      expected: parseSnapshot(raw.expected, "expected"),
      updates: parseSnapshot(raw.updates, "updates"),
    };
  }

  if (raw.mode === "bulk") {
    if (
      !Array.isArray(raw.ids)
      || raw.ids.length === 0
      || raw.ids.length > 250
      || raw.ids.some((id) => typeof id !== "string" || id.length === 0)
    ) {
      throw new JsonBodyError(400, "ids must be a list of 1–250 replication ids.");
    }

    const parsed: ParsedEditorial = { mode: "bulk", ids: raw.ids as string[] };

    if (raw.effectSlug !== undefined && raw.effectSlug !== null && raw.effectSlug !== "") {
      if (typeof raw.effectSlug !== "string" || !isValidReplicationSlug(raw.effectSlug)) {
        throw new JsonBodyError(400, "effectSlug must be a kebab-case slug.");
      }
      parsed.effectSlug = raw.effectSlug;
    }
    if (raw.artist !== undefined && raw.artist !== null && raw.artist !== "") {
      if (typeof raw.artist !== "string" || raw.artist.length > 200) {
        throw new JsonBodyError(400, "artist must be a non-blank name.");
      }
      parsed.artist = raw.artist.trim();
    }
    if (raw.role !== undefined && raw.role !== null && raw.role !== "") {
      if (typeof raw.role !== "string" || !ROLES.has(raw.role as StudioRole)) {
        throw new JsonBodyError(400, "role must be replication or figure.");
      }
      parsed.role = raw.role as StudioRole;
    }
    if (raw.addEffectTags !== undefined) {
      const tags = parseTags(raw.addEffectTags, "addEffectTags");
      if (tags.length > 0) {
        parsed.addEffectTags = tags;
      }
    }
    if (raw.showcaseExcluded !== undefined && raw.showcaseExcluded !== null) {
      if (typeof raw.showcaseExcluded !== "boolean") {
        throw new JsonBodyError(400, "showcaseExcluded must be true or false.");
      }
      parsed.showcaseExcluded = raw.showcaseExcluded;
    }

    if (
      parsed.effectSlug === undefined
      && parsed.artist === undefined
      && parsed.role === undefined
      && parsed.addEffectTags === undefined
      && parsed.showcaseExcluded === undefined
    ) {
      throw new JsonBodyError(400, "A bulk edit needs at least one field to change.");
    }

    return parsed;
  }

  throw new JsonBodyError(400, 'mode must be "single" or "bulk".');
}

export const POST = protectedRouteOperation<unknown, ParsedEditorial>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: MAX_PAYLOAD_BYTES, parse: parseEditorialBody },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to save replication editorial fields via Next route:",
  unexpectedErrorMessage: "Unable to save those replication edits right now.",
  operation: async ({ actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey = dataWrite.getAdminIntentToken?.("replicationMaintenance") ?? dataWrite.adminKey;

    if (body.mode === "single") {
      const result = await dataWrite.client.mutation(api.replications.updateEditorialFields, {
        apiKey,
        actorEmail,
        id: body.id as Id<"replications">,
        expected: body.expected,
        updates: body.updates,
      });

      // Moving a replication between effects leaves both galleries stale, so
      // the old and the new owner are published together; the single edit is
      // the studio's title path, so the record's own permalink and locale
      // mirror publish with them.
      const targets: PublicationTarget[] = [{ kind: "replication-collections" }];
      for (const slug of new Set([body.expected.effect_slug, body.updates.effect_slug])) {
        if (slug) targets.push({ kind: "effect", slug });
      }
      await publishReplicationRecord(result.slug, targets);

      return NextResponse.json({ ok: true, updated: 1, slugs: [result.slug] });
    }

    const result = await dataWrite.client.mutation(api.replications.bulkUpdateEditorialFields, {
      apiKey,
      actorEmail,
      ids: body.ids as Id<"replications">[],
      effect_slug: body.effectSlug,
      artist: body.artist,
      role: body.role,
      addEffectTags: body.addEffectTags,
      showcase_excluded: body.showcaseExcluded,
    });

    const targets: PublicationTarget[] = [{ kind: "replication-collections" }];
    if (body.effectSlug) targets.push({ kind: "effect", slug: body.effectSlug });
    await publishPublicCache({ targets, source: "manual" });

    return NextResponse.json({ ok: true, updated: result.updated, slugs: result.slugs });
  },
});
