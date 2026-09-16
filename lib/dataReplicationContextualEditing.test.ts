import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MutationCtx } from "@server/postgres/runtime/server";
import { collectionDetail, publishCollection, publishMetadata } from "../server/replicationContextualEditing";
import { updateGalleryOrder } from "../server/replications";
import { setCarouselOrder, setDisabled } from "../server/substanceGalleries";
import { getSubstanceGalleryMembers } from "../server/lib/substanceGalleryPublicReads";
import type { Doc } from "@server/postgres/runtime/dataModel";
import { galleryCandidateKeys, galleryMatchProjection } from "../server/lib/publicReadIndexes";
import { withReplicationEditJournal } from "../server/lib/replicationEditJournal";
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

function articleFixture(count: number) {
  const rows = Array.from({ length: count }, (_, index) => ({
    _id: `replication-${index}`, _creationTime: index, slug: `work-${index}`,
    title: `Work ${index}`, artist: "Artist", role: "replication", type: "image",
    format: "jpg", created_at: "2026-01-01", url: `https://media.example/work-${index}.jpg`,
    effect_slug: "tracers", effect_tags: [],
    title_drugs: [{ slug: "lsd", name: "LSD", class: "psychedelics", matched_title_text: "LSD" }],
  })) as Doc<"replications">[];
  const test = createCtx({
    memberships: [admin],
    replications: rows,
    substanceIndex: [{ _id: "substance", slug: "lsd", title: "LSD", classification: { psychoactive_class: ["Psychedelic"] } }],
    substanceGalleries: [{ _id: "gallery", substance_slug: "lsd", curated_slugs: [], removed_slugs: ["excluded-work"], carousel_order: [], updated_at: "2026-01-01" }],
    subjectiveEffects: [{ _id: "effect", slug: "tracers", name: "Tracers", gallery_order: [] }],
    publicReadIndexState: [{ _id: "gallery-index", name: "gallery", version: 1, ready: true }],
    replicationGalleryCandidates: rows.flatMap(row => galleryCandidateKeys(row).map(candidate_key => ({
      _id: `${candidate_key}:${row._id}`, candidate_key, replication_id: row._id,
      source_created: row._creationTime, ...galleryMatchProjection(row),
    }))),
  });
  return { ...test, slugs: rows.map(row => row.slug) };
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

  it("publishes a complete large article permutation without creating drug associations", async () => {
    const { ctx, rowsOf, slugs } = articleFixture(300);
    const order = [...slugs].reverse();
    const drug = await baseline(ctx, "substance", "lsd");
    await handlerOf(publishCollection)(ctx, { ...actor, targetKind: "substance", targetKey: "lsd", expectedRevision: drug.revision, requestId: "large-drug-order-operation", slugs: order, previousSlugs: slugs, title: "LSD" });
    expect(rowsOf("substanceGalleries").get("gallery")).toMatchObject({
      curated_slugs: [], removed_slugs: ["excluded-work"], carousel_order: order,
    });
    const effect = await baseline(ctx);
    await handlerOf(publishCollection)(ctx, { ...actor, targetKind: "effect", targetKey: "tracers", expectedRevision: effect.revision, requestId: "large-effect-order-operation", slugs: order, previousSlugs: slugs, title: "Tracers" });
    expect(rowsOf("subjectiveEffects").get("effect")?.gallery_order).toEqual(order);
    const current = await baseline(ctx, "substance", "lsd");
    await handlerOf(setCarouselOrder)(ctx, { ...actor, substance_slug: "lsd", expectedRevision: current.revision, carousel_order: slugs });
    expect(rowsOf("substanceGalleries").get("gallery")?.carousel_order).toEqual(slugs);
  });

  it("refuses stale eligibility and order writes without any partial mutation", async () => {
    const { ctx, rowsOf, slugs } = articleFixture(3);
    const initial = await baseline(ctx, "substance", "lsd");
    await handlerOf(setDisabled)(ctx, { ...actor, substance_slug: "lsd", disabled: true, expectedRevision: initial.revision });
    const beforeGallery = structuredClone(rowsOf("substanceGalleries").get("gallery"));
    const beforeReceipts = structuredClone([...rowsOf("replicationEditReceipts").values()]);
    await expect(handlerOf(publishCollection)(ctx, { ...actor, targetKind: "substance", targetKey: "lsd", expectedRevision: initial.revision, requestId: "stale-drug-order-operation", slugs: [...slugs].reverse(), previousSlugs: slugs, title: "LSD" })).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await expect(handlerOf(setDisabled)(ctx, { ...actor, substance_slug: "lsd", disabled: false, expectedRevision: initial.revision })).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    expect(rowsOf("substanceGalleries").get("gallery")).toEqual(beforeGallery);
    expect([...rowsOf("replicationEditReceipts").values()]).toEqual(beforeReceipts);
    expect(await getSubstanceGalleryMembers(ctx,
      rowsOf("substanceIndex").get("substance") as Doc<"substanceIndex">,
      rowsOf("substanceGalleries").get("gallery") as Doc<"substanceGalleries">,
    )).toEqual([]);
  });

  it("retains substance membership edits while refusing a partial reorder baseline", async () => {
    const { ctx, rowsOf, slugs } = articleFixture(3);
    const initial = await baseline(ctx, "substance", "lsd");
    await expect(handlerOf(publishCollection)(ctx, { ...actor, targetKind: "substance", targetKey: "lsd", expectedRevision: initial.revision, requestId: "partial-drug-order-operation", slugs: slugs.slice(1), previousSlugs: slugs.slice(1), title: "LSD" })).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await handlerOf(publishCollection)(ctx, { ...actor, targetKind: "substance", targetKey: "lsd", expectedRevision: initial.revision, requestId: "remove-drug-member-operation", slugs: slugs.slice(1), previousSlugs: slugs, title: "LSD" });
    expect(rowsOf("substanceGalleries").get("gallery")).toMatchObject({
      curated_slugs: [], removed_slugs: ["excluded-work", slugs[0]], carousel_order: slugs.slice(1),
    });
  });

  it("orders an effect gallery containing works a drug showcase excludes, while still refusing them for a substance", async () => {
    // Showcase eligibility keeps `showcase_excluded` works and combination titles
    // out of drug showcases. They are ordinary members of the effect galleries
    // whose mechanism they depict, so ordering one must not be refused.
    const { ctx, rowsOf } = createCtx({
      memberships: [admin],
      subjectiveEffects: [{ _id: "effect", slug: "tracers", name: "Tracers", gallery_order: ["excluded", "combination"] }],
      substanceIndex: [{ _id: "substance", slug: "lsd", title: "LSD", classification: { psychoactive_class: ["Psychedelic"] } }],
      substanceGalleries: [{ _id: "gallery", substance_slug: "lsd", curated_slugs: [], removed_slugs: [], carousel_order: [], updated_at: "2026-01-01" }],
      replications: [
        { _id: "replication-excluded", slug: "excluded", title: "Excluded work", artist: "Artist", role: "replication", type: "image", effect_slug: "tracers", effect_tags: [], showcase_excluded: true },
        {
          _id: "replication-combination", slug: "combination", title: "LSD and ketamine together", artist: "Artist",
          role: "replication", type: "image", effect_slug: "tracers", effect_tags: [],
          title_drugs: [
            { slug: "lsd", name: "LSD", class: "psychedelics", matched_title_text: "LSD" },
            { slug: "ketamine", name: "Ketamine", class: "dissociatives", matched_title_text: "ketamine" },
          ],
        },
      ] as Doc<"replications">[],
    });

    const effect = await baseline(ctx);
    await handlerOf(publishCollection)(ctx, {
      ...actor, targetKind: "effect", targetKey: "tracers", expectedRevision: effect.revision,
      requestId: "effect-order-excluded-members", slugs: ["combination", "excluded"],
      previousSlugs: ["excluded", "combination"], title: "Tracers",
    });
    expect(rowsOf("subjectiveEffects").get("effect")?.gallery_order).toEqual(["combination", "excluded"]);

    const substance = await baseline(ctx, "substance", "lsd");
    await expect(handlerOf(publishCollection)(ctx, {
      ...actor, targetKind: "substance", targetKey: "lsd", expectedRevision: substance.revision,
      requestId: "substance-order-excluded-members", slugs: ["excluded"], previousSlugs: ["excluded"], title: "LSD",
    })).rejects.toMatchObject({ data: { message: expect.stringContaining("not eligible") } });
  });

  it("does not journal unrelated effect prose in the replication journal", async () => {
    const { ctx, rowsOf } = fixture();
    const journal = withReplicationEditJournal(ctx);
    const id = ctx.db.normalizeId("subjectiveEffects", "effect")!;
    await journal.ctx.db.patch(id, { description_raw: "Narrative-only correction" });
    await journal.commit(actor);
    expect(rowsOf("replicationEditReceipts").size).toBe(0);
  });
});
