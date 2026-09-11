import { NextResponse } from "next/server";
import type { PublicationTarget } from "@server/next/publicationWire";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { publishReplicationRecord } from "../publishReplicationRecord";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../../../../convex/_generated/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { replicationViewerEditorRoute } from "@server/next/replicationViewerEditorPolicy";

type Kind = "substance" | "effect" | "artist" | "playlist";
function targetKind(value: unknown): Kind | undefined {
  if (value === null || value === undefined) return undefined;
  if (value === "substance" || value === "effect" || value === "artist" || value === "playlist") return value;
  throw new JsonBodyError(400, "Unknown collection kind.");
}

export const GET = replicationViewerEditorRoute(protectedRouteOperation({
  auth: "contributor", rateLimit: "diagnosticRead", capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Unable to load contextual replication:",
  operation: async ({ request, actorEmail, convexWrite }) => {
    if (!convexWrite) throw new Error("Convex capability is required.");
    const search = new URL(request.url).searchParams;
    const effectQuery = search.get("effectQuery");
    if (effectQuery !== null) {
      const result = await convexWrite.client.query(api.replicationContextualEditing.searchEffectOptions, {
        apiKey: convexWrite.getAdminIntentToken?.("replicationMaintenance") ?? convexWrite.adminKey,
        actorEmail, prefix: effectQuery,
      });
      return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
    }
    const slug = search.get("slug");
    if (!slug || slug.length > 200) throw new JsonBodyError(400, "A replication slug is required.");
    const result = await convexWrite.client.query(api.replicationContextualEditing.detail, {
      apiKey: convexWrite.getAdminIntentToken?.("replicationMaintenance") ?? convexWrite.adminKey,
      actorEmail, slug, targetKind: targetKind(search.get("targetKind")), targetKey: search.get("targetKey") ?? undefined,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  },
}));

type Metadata = Omit<FunctionArgs<typeof api.replicationContextualEditing.publishMetadata>, "apiKey" | "actorEmail">;
type Collection = Omit<FunctionArgs<typeof api.replicationContextualEditing.publishCollection>, "apiKey" | "actorEmail">;
/** A metadata publish names the work's slug beside its id: the mutation keys by id, the caches and the translation queue by slug. */
type Publication = { mode: "metadata"; change: Metadata; slug: string } | { mode: "collection"; change: Collection };
const REPLICATION_SLUG = /^[a-z0-9][a-z0-9_-]{0,127}$/;
export const POST = replicationViewerEditorRoute(protectedRouteOperation<Publication>({
  auth: "contributor", rateLimit: "editorSmallWrite", capabilities: [{ type: "convexWrite" }], body: { maxBytes: 2 * 1024 * 1024 },
  unexpectedErrorLabel: "Unable to publish contextual replication:",
  operation: async ({ body, actorEmail, convexWrite, auth }) => {
    if (!convexWrite) throw new Error("Convex capability is required.");
    if (!body?.change || (body.mode !== "metadata" && body.mode !== "collection")) throw new JsonBodyError(400, "A publication change is required.");
    if (body.mode === "metadata" && (typeof body.slug !== "string" || !REPLICATION_SLUG.test(body.slug))) throw new JsonBodyError(400, "A metadata publication names its replication slug.");
    if (auth.role !== "admin" && (body.mode === "metadata" || body.change.targetKind !== "playlist")) throw new JsonBodyError(403, "Only an admin can publish canonical metadata or shared showcases.");
    const credentials = { apiKey: convexWrite.getAdminIntentToken?.("replicationMaintenance") ?? convexWrite.adminKey, actorEmail };
    const result = body.mode === "metadata"
      ? await convexWrite.client.mutation(api.replicationContextualEditing.publishMetadata, { ...body.change, ...credentials })
      : await convexWrite.client.mutation(api.replicationContextualEditing.publishCollection, { ...body.change, ...credentials });
    const targets: PublicationTarget[] = [
      { kind: "replication-collections" },
      { kind: "contributor-lists" },
    ];
    if (body.mode === "collection") {
      const { targetKind: kind, targetKey: key } = body.change;
      if (kind === "substance") targets.push({ kind: "article", slug: key });
      if (kind === "effect") targets.push({ kind: "effect", slug: key });
    }
    if (body.mode === "metadata") await publishReplicationRecord(body.slug, targets);
    else await publishPublicCache({ targets, source: "manual" });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  },
}));
