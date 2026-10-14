import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MutationCtx } from "@server/postgres/runtime/server";
import { collectionDetail, publishCollection, publishMetadata } from "../server/replicationContextualEditing";
import { updateGalleryOrder } from "../server/replications";
import { admin, createCtx, SERVER_KEY } from "./changeProposalReviewFixture";

function handlerOf(fn: unknown) {
  // Postgres exposes the registered handler on this runtime-only testing seam.
  const registered = fn as { _handler: (ctx: MutationCtx, args: Record<string, unknown>) => Promise<Record<string, unknown>> };
  return registered._handler;
}
const actor = { apiKey: SERVER_KEY, actorEmail: admin.email };
const owner = { ...actor, actorEmail: "owner@example.com" };
function fixture() {
  return createCtx({
    memberships: [admin, { _id: "owner", email: owner.actorEmail, role: "contributor" }, { _id: "other", email: "other@example.com", role: "contributor" }],
    subjectiveEffects: [{ _id: "effect", slug: "tracers", name: "Tracers", gallery_order: ["a", "b"] }],
    replicationPlaylists: [{ _id: "playlist", key: "favorites", title: "Favorites", owner_email: owner.actorEmail, replication_slugs: ["a", "b"], updated_at: "2026-01-01" }],
    replications: ["a", "b"].map(slug => ({ _id: `replication-${slug}`, slug, title: slug, artist: "Artist", role: "replication", type: "image", effect_slug: "tracers", effect_tags: [] })),
  });
}
async function baseline(ctx: MutationCtx, targetKind = "effect", targetKey = "tracers", credentials = actor) {
  return handlerOf(collectionDetail)(ctx, { ...credentials, targetKind, targetKey });
}

beforeEach(() => { process.env.DATA_ADMIN_KEY = SERVER_KEY; });
afterEach(() => { delete process.env.DATA_ADMIN_KEY; });

describe("contextual replication publication", () => {
  it("allows an owning contributor without granting another playlist or shared publication rights", async () => {
    const { ctx, rowsOf } = fixture();
    const loaded = await baseline(ctx, "playlist", "favorites", owner);
    const change = { ...owner, targetKind: "playlist", targetKey: "favorites", expectedRevision: loaded.revision, requestId: "owned-playlist-operation", slugs: ["b", "a"], previousSlugs: ["a", "b"], title: "My favorites" };
    await expect(handlerOf(publishCollection)(ctx, { ...change, actorEmail: "other@example.com" })).rejects.toThrow("Only the playlist owner");
    await expect(handlerOf(publishCollection)(ctx, { ...change, targetKind: "effect", targetKey: "tracers" })).rejects.toThrow("Only an admin");
    await expect(handlerOf(publishMetadata)(ctx, { ...owner, id: "replication-a" })).rejects.toThrow("Admin access required");
    await expect(handlerOf(publishCollection)(ctx, change)).resolves.toMatchObject({ ok: true, reconciled: false });
    expect(rowsOf("replicationPlaylists").get("playlist")).toMatchObject({ title: "My favorites", replication_slugs: ["b", "a"] });
    expect([...rowsOf("replicationEditReceipts").values()].map(row => row.requestId)).toEqual([change.requestId]);
  });

  it("reconciles only the exact request, including both revision and membership baseline", async () => {
    const { ctx, rowsOf } = fixture();
    const loaded = await baseline(ctx, "playlist", "favorites", owner);
    const change = { ...owner, targetKind: "playlist", targetKey: "favorites", expectedRevision: loaded.revision, requestId: "exact-replay-operation", slugs: ["b", "a"], previousSlugs: ["a", "b"], title: "Favorites" };
    await handlerOf(publishCollection)(ctx, change);
    await expect(handlerOf(publishCollection)(ctx, change)).resolves.toMatchObject({ reconciled: true });
    await expect(handlerOf(publishCollection)(ctx, { ...change, expectedRevision: "0".repeat(64) })).rejects.toThrow("different changes");
    await expect(handlerOf(publishCollection)(ctx, { ...change, previousSlugs: ["a"] })).rejects.toThrow("different changes");
    expect(rowsOf("contentRevisions").size).toBe(1);
  });

  it("rejects an old baseline after retained writers return an order from A to B to A", async () => {
    const { ctx, rowsOf } = fixture();
    const initial = await baseline(ctx);
    await handlerOf(updateGalleryOrder)(ctx, { ...actor, effect_slug: "tracers", replication_slugs: ["b", "a"], expectedRevision: initial.revision });
    const changed = await baseline(ctx);
    await handlerOf(updateGalleryOrder)(ctx, { ...actor, effect_slug: "tracers", replication_slugs: ["a", "b"], expectedRevision: changed.revision });
    expect(rowsOf("subjectiveEffects").get("effect")?.gallery_order).toEqual(["a", "b"]);
    await expect(handlerOf(updateGalleryOrder)(ctx, { ...actor, effect_slug: "tracers", replication_slugs: ["b", "a"], expectedRevision: initial.revision })).rejects.toThrow("collection changed");
    await expect(handlerOf(publishCollection)(ctx, { ...actor, targetKind: "effect", targetKey: "tracers", expectedRevision: initial.revision, requestId: "stale-contextual-operation", slugs: ["b", "a"], previousSlugs: ["a", "b"], title: "Tracers" })).rejects.toThrow("record changed");
    const current = await baseline(ctx);
    await handlerOf(publishCollection)(ctx, { ...actor, targetKind: "effect", targetKey: "tracers", expectedRevision: current.revision, requestId: "fresh-contextual-operation", slugs: ["b", "a"], previousSlugs: ["a", "b"], title: "Tracers" });
    await expect(handlerOf(updateGalleryOrder)(ctx, { ...actor, effect_slug: "tracers", replication_slugs: ["a", "b"], expectedRevision: current.revision })).rejects.toThrow("collection changed");
  });
});
