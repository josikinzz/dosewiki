import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { api } from "../../../../../../convex/_generated/api";
import { isValidReplicationSlug } from "@/features/dev/tools/replication-studio/replicationStudioModel";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { PUBLIC_CONVEX_CACHE_TAGS } from "@server/convex/publicData";
import { replicationViewerEditorRoute } from "@server/next/replicationViewerEditorPolicy";

export const runtime = "nodejs";

const TARGET_KEY = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;
const MAX_ORDER_SLUGS = 250;

type OrderTargetKind = "artist" | "effect" | "substance";
type CarouselOrderBody = {
  targetKind?: unknown;
  targetKey?: unknown;
  slugs?: unknown;
  expectedOrder?: unknown;
  expectedUpdatedAt?: unknown;
};

type ParsedCarouselOrder = {
  targetKind: OrderTargetKind;
  targetKey: string;
  slugs: string[];
  expectedOrder: string[] | undefined;
  expectedUpdatedAt: string | null | undefined;
};

function parseTargetKind(value: unknown): OrderTargetKind {
  if (value === "artist" || value === "effect" || value === "substance") {
    return value;
  }
  throw new JsonBodyError(400, "targetKind must be artist, effect, or substance.");
}

function parseTargetKey(value: unknown): string {
  if (typeof value !== "string" || !TARGET_KEY.test(value)) {
    throw new JsonBodyError(400, "A valid collection target key is required.");
  }
  return value;
}

function parseSlugArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_ORDER_SLUGS) {
    throw new JsonBodyError(
      400,
      `${field} must be an array of at most ${MAX_ORDER_SLUGS} replication slugs.`,
    );
  }
  const slugs: string[] = [];
  const seen = new Set<string>();
  for (const slug of value) {
    if (typeof slug !== "string" || !isValidReplicationSlug(slug)) {
      throw new JsonBodyError(400, `Every ${field} entry must be a replication slug.`);
    }
    if (!seen.has(slug)) {
      seen.add(slug);
      slugs.push(slug);
    }
  }
  return slugs;
}

export function parseCarouselOrderBody(
  raw: CarouselOrderBody,
): ParsedCarouselOrder {
  const targetKind = parseTargetKind(raw.targetKind);
  const targetKey = parseTargetKey(raw.targetKey);
  const slugs = parseSlugArray(raw.slugs, "slugs");
  const expectedOrder =
    raw.expectedOrder === undefined
      ? undefined
      : parseSlugArray(raw.expectedOrder, "expectedOrder");

  let expectedUpdatedAt: string | null | undefined;
  if (raw.expectedUpdatedAt === null) expectedUpdatedAt = null;
  else if (
    typeof raw.expectedUpdatedAt === "string" &&
    raw.expectedUpdatedAt.length > 0
  ) {
    expectedUpdatedAt = raw.expectedUpdatedAt;
  } else if (raw.expectedUpdatedAt !== undefined) {
    throw new JsonBodyError(
      400,
      "expectedUpdatedAt must be a stored timestamp, null, or omitted.",
    );
  }

  return { targetKind, targetKey, slugs, expectedOrder, expectedUpdatedAt };
}

export function parseCarouselTargetRequest(request: Request): {
  targetKind: OrderTargetKind;
  targetKey: string;
} {
  const search = new URL(request.url).searchParams;
  return {
    targetKind: parseTargetKind(search.get("targetKind")),
    targetKey: parseTargetKey(search.get("targetKey")),
  };
}

export const GET = replicationViewerEditorRoute(protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to load a replication carousel order:",
  unexpectedErrorMessage: "Unable to load that carousel order right now.",
  operation: async ({ request, convexWrite }) => {
    if (!convexWrite) throw new Error("Convex write capability is required.");
    const target = parseCarouselTargetRequest(request);

    if (target.targetKind === "substance") {
      const row = await convexWrite.client.query(api.substanceGalleries.getBySubstance, {
        substance_slug: target.targetKey,
      });
      return NextResponse.json({
        ok: true,
        target: {
          ...target,
          order: row?.carousel_order ?? [],
          updatedAt: row?.updated_at ?? null,
        },
      });
    }
    if (target.targetKind === "effect") {
      const row = await convexWrite.client.query(api.subjectiveEffects.getBySlug, {
        slug: target.targetKey,
      });
      if (!row) {
        throw new JsonBodyError(404, "No effect found for that carousel.");
      }
      return NextResponse.json({
        ok: true,
        target: { ...target, order: row.gallery_order ?? [], updatedAt: null },
      });
    }
    const row = await convexWrite.client.query(api.contributorProfiles.getByKey, {
      key: target.targetKey,
    });
    if (!row) {
      throw new JsonBodyError(404, "No contributor found for that carousel.");
    }
    return NextResponse.json({
      ok: true,
      target: {
        ...target,
        order: row.replicationOrder ?? [],
        updatedAt: null,
      },
    });
  },
}));

export const PATCH = replicationViewerEditorRoute(protectedRouteOperation<
  CarouselOrderBody,
  ParsedCarouselOrder
>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: 32 * 1024, parse: parseCarouselOrderBody },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to save a replication carousel order:",
  unexpectedErrorMessage: "Unable to save that carousel order right now.",
  operation: async ({ actorEmail, body, convexWrite }) => {
    if (!convexWrite) throw new Error("Convex write capability is required.");
    const apiKey =
      convexWrite.getAdminIntentToken?.("editorArticleWrite") ??
      convexWrite.adminKey;

    let result: unknown;
    if (body.targetKind === "substance") {
      result = await convexWrite.client.mutation(
        api.substanceGalleries.setCarouselOrder,
        {
          apiKey,
          actorEmail,
          substance_slug: body.targetKey,
          carousel_order: body.slugs,
          expectedCarouselOrder: body.expectedOrder,
          expectedUpdatedAt: body.expectedUpdatedAt,
        },
      );
      revalidatePath(`/${body.targetKey}`);
    } else if (body.targetKind === "effect") {
      result = await convexWrite.client.mutation(
        api.replications.updateGalleryOrder,
        {
          apiKey:
            convexWrite.getAdminIntentToken?.("replicationMaintenance") ??
            convexWrite.adminKey,
          actorEmail,
          effect_slug: body.targetKey,
          replication_slugs: body.slugs,
          expected_replication_slugs: body.expectedOrder,
        },
      );
      revalidatePath(`/effects/${body.targetKey}`);
    } else {
      result = await convexWrite.client.mutation(
        api.contributorProfiles.setContributorOrdering,
        {
          apiKey,
          actorEmail,
          key: body.targetKey,
          replicationOrder: body.slugs,
          expectedReplicationOrder: body.expectedOrder,
        },
      );
      revalidatePath(`/replications/artist/${body.targetKey}`);
    }

    revalidateTag(PUBLIC_CONVEX_CACHE_TAGS.replications, { expire: 0 });
    return NextResponse.json({ ok: true, result });
  },
}));
