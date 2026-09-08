import { NextResponse } from "next/server";

import { api } from "../../../../../../convex/_generated/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import type { PublicationTarget } from "@server/next/publicationWire";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { replicationViewerEditorRoute } from "@server/next/replicationViewerEditorPolicy";
import { parseCarouselOrderBody, parseCarouselTargetRequest, type CarouselOrderBody, type ParsedCarouselOrder } from "./carouselOrderRequest";

export const runtime = "nodejs";


export const GET = replicationViewerEditorRoute(protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to load a replication carousel order:",
  unexpectedErrorMessage: "Unable to load that carousel order right now.",
  operation: async ({ request, actorEmail, convexWrite }) => {
    if (!convexWrite) throw new Error("Convex write capability is required.");
    const target = parseCarouselTargetRequest(request);
    const baseline = await convexWrite.client.query(api.replicationContextualEditing.collectionDetail, {
      ...target, actorEmail, apiKey: convexWrite.getAdminIntentToken?.("replicationMaintenance") ?? convexWrite.adminKey,
    });
    return NextResponse.json({ ok: true, target: { ...target, ...baseline } });
  },
}));

export const PATCH = replicationViewerEditorRoute(protectedRouteOperation<
  CarouselOrderBody,
  ParsedCarouselOrder
>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: 2 * 1024 * 1024, parse: parseCarouselOrderBody },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to save a replication carousel order:",
  unexpectedErrorMessage: "Unable to save that carousel order right now.",
  operation: async ({ actorEmail, body, convexWrite }) => {
    if (!convexWrite) throw new Error("Convex write capability is required.");
    const apiKey =
      convexWrite.getAdminIntentToken?.("editorArticleWrite") ??
      convexWrite.adminKey;

    let result: unknown;
    let target: PublicationTarget;
    if (body.targetKind === "substance") {
      result = await convexWrite.client.mutation(
        api.substanceGalleries.setCarouselOrder,
        {
          apiKey,
          actorEmail,
          substance_slug: body.targetKey,
          carousel_order: body.slugs,
          expectedRevision: body.expectedRevision,
          expectedCarouselOrder: body.expectedOrder,
          expectedUpdatedAt: body.expectedUpdatedAt,
        },
      );
      target = { kind: "article", slug: body.targetKey };
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
          expectedRevision: body.expectedRevision,
          expected_replication_slugs: body.expectedOrder,
        },
      );
      target = { kind: "effect", slug: body.targetKey };
    } else {
      result = await convexWrite.client.mutation(
        api.contributorProfiles.setContributorOrdering,
        {
          apiKey: convexWrite.getAdminIntentToken?.("profileMediaWrite") ?? convexWrite.adminKey,
          actorEmail,
          key: body.targetKey,
          replicationOrder: body.slugs,
          expectedRevision: body.expectedRevision,
          expectedReplicationOrder: body.expectedOrder,
        },
      );
      target = { kind: "contributor", slug: body.targetKey };
    }

    // Reordering never changes membership, but every carousel that reads this
    // collection is now out of date, including the shared showcase feed.
    await publishPublicCache({
      targets: [target, { kind: "replication-collections" }],
      source: "manual",
    });
    return NextResponse.json({ ok: true, result });
  },
}));
