import { NextResponse } from "next/server";

import { api } from "@server/postgres/runtime/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import type { PublicationTarget } from "@server/next/publicationWire";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { replicationViewerEditorRoute } from "@server/next/replicationViewerEditorPolicy";
import { parseCarouselOrderBody, parseCarouselTargetRequest, type CarouselOrderBody, type ParsedCarouselOrder } from "./carouselOrderRequest";

export const runtime = "nodejs";


export const GET = replicationViewerEditorRoute(protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load a replication carousel order:",
  unexpectedErrorMessage: "Unable to load that carousel order right now.",
  operation: async ({ request, actorEmail, dataWrite }) => {
    if (!dataWrite) throw new Error("Postgres write capability is required.");
    const target = parseCarouselTargetRequest(request);
    const baseline = await dataWrite.client.query(api.replicationContextualEditing.collectionDetail, {
      ...target, actorEmail, apiKey: dataWrite.getAdminIntentToken?.("replicationMaintenance") ?? dataWrite.adminKey,
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
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to save a replication carousel order:",
  unexpectedErrorMessage: "Unable to save that carousel order right now.",
  operation: async ({ actorEmail, body, dataWrite }) => {
    if (!dataWrite) throw new Error("Postgres write capability is required.");
    const apiKey =
      dataWrite.getAdminIntentToken?.("editorArticleWrite") ??
      dataWrite.adminKey;

    let result: unknown;
    let target: PublicationTarget;
    if (body.targetKind === "substance") {
      result = await dataWrite.client.mutation(
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
      result = await dataWrite.client.mutation(
        api.replications.updateGalleryOrder,
        {
          apiKey:
            dataWrite.getAdminIntentToken?.("replicationMaintenance") ??
            dataWrite.adminKey,
          actorEmail,
          effect_slug: body.targetKey,
          replication_slugs: body.slugs,
          expectedRevision: body.expectedRevision,
          expected_replication_slugs: body.expectedOrder,
        },
      );
      target = { kind: "effect", slug: body.targetKey };
    } else {
      result = await dataWrite.client.mutation(
        api.contributorProfiles.setContributorOrdering,
        {
          apiKey: dataWrite.getAdminIntentToken?.("profileMediaWrite") ?? dataWrite.adminKey,
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
