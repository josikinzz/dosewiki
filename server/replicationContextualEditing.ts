import { PostgresError, v } from "../lib/postgres/runtime/values";
import { query, type MutationCtx, type QueryCtx } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { recordRevision } from "./lib/contentRevisions";
import { requireRole, roleMeetsFloor } from "./lib/auth";
import { updateEditorialFieldsHandler } from "./lib/replicationStudio";
import { editorialSnapshotOf } from "./lib/replicationPolicy";
import { resolveReplicationUrls } from "./lib/replicationUrls";
import { GALLERY_CURATION_SLUG_CAP, isShowcaseEligible, isCombinationReplication } from "../src/data/substanceReplicationGallery";
import { canEditPlaylist } from "./replicationPlaylists";
import { uniqueSubstanceBySlug } from "./lib/substanceGalleryCurationReads";
import { getStoredContributorProfile } from "./lib/contributorProfilePersistence";
import { normalizeProfileKey } from "./lib/contributorProfiles";
import { stableStringify } from "../lib/proposals/contentHash";
import { replicationRevision as revision, replicationJournalSnapshot } from "./lib/replicationEditJournal";
import { getSubstanceGalleryMembers } from "./lib/substanceGalleryPublicReads";
const kind = v.union(v.literal("substance"), v.literal("effect"), v.literal("artist"), v.literal("playlist"));
const credentials = { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()) };
type Kind = "substance" | "effect" | "artist" | "playlist";
async function collectionRow(ctx: QueryCtx | MutationCtx, type: Kind, key: string) {
  if (type === "substance") return ctx.db.query("substanceGalleries").withIndex("by_substance", q => q.eq("substance_slug", key)).first();
  if (type === "effect") return ctx.db.query("subjectiveEffects").withIndex("by_slug", q => q.eq("slug", key)).first();
  if (type === "artist") return getStoredContributorProfile(ctx, normalizeProfileKey(key));
  return ctx.db.query("replicationPlaylists").withIndex("by_key", q => q.eq("key", key)).first();
}

export const collectionDetail = query({
  args: { ...credentials, targetKind: kind, targetKey: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, { ...args, adminIntent: "replicationMaintenance" }, "contributor");
    const stored = await collectionRow(ctx, args.targetKind, args.targetKey);
    if (args.targetKind === "playlist" && (!stored || !("replication_slugs" in stored) || stored.archived_at || !canEditPlaylist(actor, stored))) throw new PostgresError({ code: "NOT_OWNER", message: "Only the playlist owner or an admin can read this playlist." });
    if (args.targetKind !== "playlist" && !roleMeetsFloor(actor.role, "editor")) throw new PostgresError({ code: "FORBIDDEN", message: "An editor role is required to inspect this collection." });
    if (!stored && args.targetKind !== "substance") throw new PostgresError({ code: "COLLECTION_NOT_FOUND", message: "This collection no longer exists." });
    const target = `${args.targetKind}:${args.targetKind === "artist" ? normalizeProfileKey(args.targetKey) : args.targetKey}`;
    const order = stored && "replication_slugs" in stored ? stored.replication_slugs : stored && "curated_slugs" in stored ? stored.carousel_order ?? [] : stored && "slug" in stored ? stored.gallery_order ?? [] : stored && "displayName" in stored ? stored.replicationOrder ?? [] : [];
    return { revision: await revision(ctx, stored, target), order, disabled: stored && "curated_slugs" in stored ? stored.disabled ?? false : false, updatedAt: stored && "updated_at" in stored ? stored.updated_at : null };
  },
});
const failConflict = () => { throw new PostgresError({ code: "CONFLICT", message: "This record changed. Your draft is retained; reload the stored version before publishing." }); };

/** Prefix lookup reads at most eight narrative records, never the effect corpus. */
export const searchEffectOptions = query({
  args: { ...credentials, prefix: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, { ...args, adminIntent: "replicationMaintenance" }, "editor");
    const prefix = args.prefix.trim().toLowerCase();
    if (!/^[a-z0-9-]{2,100}$/.test(prefix)) throw new PostgresError({ code: "INVALID_REPLICATION_EDIT", message: "Enter at least two characters from an effect slug." });
    const matches = await ctx.db.query("subjectiveEffects").withIndex("by_slug", q => q.gte("slug", prefix).lt("slug", `${prefix}\uffff`)).take(8);
    return { effects: matches.map(effect => ({ slug: effect.slug, name: effect.name ?? effect.slug })) };
  },
});

export const detail = query({
  args: { ...credentials, slug: v.string(), targetKind: v.optional(kind), targetKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, { ...args, adminIntent: "replicationMaintenance" }, "contributor");
    const row = await ctx.db.query("replications").withIndex("by_slug", q => q.eq("slug", args.slug)).first();
    if (!row) throw new PostgresError({ code: "REPLICATION_NOT_FOUND", message: "This replication no longer exists." });
    const urls = await resolveReplicationUrls(ctx, row);
    const effects = [...new Set([...(row.effect_slug ? [row.effect_slug] : []), ...(row.effect_tags ?? [])])].map(slug => ({ slug, name: slug }));
    const playlists = await ctx.db.query("replicationPlaylists").withIndex("by_owner_email", q => q.eq("owner_email", actor.email)).take(25);
    const stored = args.targetKind && args.targetKey ? await collectionRow(ctx, args.targetKind, args.targetKey) : null;
    if (args.targetKind === "playlist") {
      if (!stored || !("replication_slugs" in stored) || stored.archived_at) throw new PostgresError({ code: "COLLECTION_NOT_FOUND", message: "This playlist no longer exists." });
      if (!canEditPlaylist(actor, stored)) throw new PostgresError({ code: "NOT_OWNER", message: "This playlist belongs to another member." });
    }
    let order: string[] = [];
    if (stored && "replication_slugs" in stored) order = stored.replication_slugs;
    else if (stored && "carousel_order" in stored) order = stored.carousel_order ?? [];
    else if (stored && "gallery_order" in stored) order = stored.gallery_order ?? [];
    else if (stored && "replicationOrder" in stored) order = stored.replicationOrder ?? [];
    return {
      row: { id: row._id, slug: row.slug, ...editorialSnapshotOf(row), source_url: row.source_url ?? null, artist_url: row.artist_url ?? null, type: row.type, format: row.format, created_at: row.created_at, duration: row.duration ?? null, file_size: row.file_size ?? null, effect_name: row.effect_slug ?? null, ...urls },
      revision: await revision(ctx, row, `replication:${row._id}`), effects,
      playlists: playlists.filter(p => !p.archived_at && canEditPlaylist(actor, p)).map(p => ({ key: p.key, title: p.title })),
      collection: { revision: await revision(ctx, stored, `${args.targetKind}:${args.targetKind === "artist" ? normalizeProfileKey(args.targetKey ?? "") : args.targetKey}`), order, removed: stored && "removed_slugs" in stored ? stored.removed_slugs : [], disabled: stored && "curated_slugs" in stored ? stored.disabled ?? false : false, editable: actor.role === "admin" || Boolean(stored && "replication_slugs" in stored && canEditPlaylist(actor, stored)), title: stored && "title" in stored ? stored.title : args.targetKey ?? "Collection" },
    };
  },
});

async function receipt(ctx: MutationCtx, actorEmail: string, requestId: string, target: string, expectedRevision: string, after: unknown) {
  if (!/^[\w-]{16,100}$/.test(requestId)) throw new PostgresError({ code: "INVALID_REPLICATION_EDIT", message: "A publication request ID is required." })
  const existing = await ctx.db.query("replicationEditReceipts").withIndex("by_actor_request", q => q.eq("actorEmail", actorEmail).eq("requestId", requestId)).first();
  if (existing && (existing.target !== target || existing.expectedRevision !== expectedRevision || stableStringify(existing.after.requested) !== stableStringify(after))) throw new PostgresError({ code: "REPLICATION_CHANGE_REUSED", message: "This request ID was already used for different changes." });
  return existing;
}
const snapshot = v.object({ title: v.string(), artist: v.string(), role: v.union(v.literal("replication"), v.literal("figure")), effect_slug: v.union(v.string(), v.null()), credit_line: v.union(v.string(), v.null()), effect_tags: v.array(v.string()) });
export const publishMetadata = mutation({
  args: { ...credentials, id: v.id("replications"), expectedRevision: v.string(), requestId: v.string(), updates: snapshot, sourceUrl: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, { ...args, adminIntent: "replicationMaintenance" }, "admin");
    const after = { ...args.updates, source_url: args.sourceUrl };
    const target = `replication:${args.id}`;
    const existingReceipt = await receipt(ctx, actor.email, args.requestId, target, args.expectedRevision, after);
    if (existingReceipt) return { ok: true, reconciled: true, resultRevision: existingReceipt._id };
    const row = await ctx.db.get(args.id);
    if (!row) throw new PostgresError({ code: "REPLICATION_NOT_FOUND", message: "This replication no longer exists." });
    if (await revision(ctx, row, target) !== args.expectedRevision) return failConflict();
    if (args.updates.title.length > 400 || args.updates.artist.length > 200 || (args.updates.credit_line?.length ?? 0) > 2000 || args.updates.effect_tags.length > 250) throw new PostgresError({ code: "INVALID_REPLICATION_EDIT", message: "The metadata exceeds the supported field limits." })
    if (args.sourceUrl) {
      let url: URL;
      try { url = new URL(args.sourceUrl); }
      catch { throw new PostgresError({ code: "INVALID_REPLICATION_EDIT", message: "Source must be a valid HTTP or HTTPS URL." }); }
      if (!["https:", "http:"].includes(url.protocol) || args.sourceUrl.length > 2000) throw new PostgresError({ code: "INVALID_REPLICATION_EDIT", message: "Source must be an HTTP or HTTPS URL." });
    }
    await updateEditorialFieldsHandler(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail, id: args.id, expected: editorialSnapshotOf(row), updates: args.updates });
    await ctx.db.patch(row._id, { source_url: args.sourceUrl || undefined });
    // The immutable receipt ID is the resulting publication revision, included in subsequent CAS tokens.
    const resultRevision = await ctx.db.insert("replicationEditReceipts", { requestId: args.requestId, actorEmail: actor.email, actorRole: actor.role, operation: "canonical-metadata", expectedRevision: args.expectedRevision, publications: ["dosewiki", "effectindex"], target, before: row, after: { requested: after, stored: await ctx.db.get(row._id) }, createdAt: new Date().toISOString() });
    return { ok: true, reconciled: false, resultRevision };
  },
});

export const publishCollection = mutation({
  args: { ...credentials, targetKind: kind, targetKey: v.string(), expectedRevision: v.string(), requestId: v.string(), slugs: v.array(v.string()), previousSlugs: v.array(v.string()), title: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, { ...args, adminIntent: "replicationMaintenance" }, "contributor");
    const stored = await collectionRow(ctx, args.targetKind, args.targetKey);
    if (args.targetKind === "playlist") {
      if (!stored || !("replication_slugs" in stored) || stored.archived_at) throw new PostgresError({ code: "COLLECTION_NOT_FOUND", message: "This playlist no longer exists." });
      if (!canEditPlaylist(actor, stored)) throw new PostgresError({ code: "NOT_OWNER", message: "Only the playlist owner or an admin can publish this playlist." });
    } else if (actor.role !== "admin") throw new PostgresError({ code: "FORBIDDEN", message: "Only an admin can curate this collection." });
    const after = { slugs: args.slugs, previousSlugs: args.previousSlugs, title: args.title };
    const target = `${args.targetKind}:${args.targetKind === "artist" ? normalizeProfileKey(args.targetKey) : args.targetKey}`;
    const existingReceipt = await receipt(ctx, actor.email, args.requestId, target, args.expectedRevision, after);
    if (existingReceipt) return { ok: true, reconciled: true, resultRevision: existingReceipt._id };
    if (await revision(ctx, stored, target) !== args.expectedRevision) return failConflict();
    const submitted = new Set(args.slugs);
    const previous = new Set(args.previousSlugs);
    if (submitted.size !== args.slugs.length || previous.size !== args.previousSlugs.length) throw new PostgresError({ code: "INVALID_REPLICATION_EDIT", message: "Collection orders require distinct works." });
    if ((args.targetKind === "playlist" || args.targetKind === "artist") && args.slugs.length > 250) throw new PostgresError({ code: "INVALID_REPLICATION_EDIT", message: "Playlists and artist collections require at most 250 distinct works." });
    const orderOnly = submitted.size === previous.size && args.slugs.every(slug => previous.has(slug));
    if (!args.title.trim() || args.title.length > 400) throw new PostgresError({ code: "INVALID_REPLICATION_EDIT", message: "A collection title is required." })
    // Showcase eligibility is a substance-placement rule: `showcase_excluded` and
    // combination titles are kept out of drug showcases, not out of the effect and
    // artist collections they legitimately belong to. Effect and artist orders take
    // their membership from canonical metadata and are order-only below, so a work
    // being present is already the membership decision; only the row must exist.
    for (const slug of args.slugs) {
      const row = await ctx.db.query("replications").withIndex("by_slug", q => q.eq("slug", slug)).first();
      if (!row) throw new PostgresError({ code: "INVALID_REPLICATION_EDIT", message: `The work ${slug} no longer exists.` })
      if (args.targetKind !== "substance") continue;
      if (!isShowcaseEligible(row) || (!previous.has(slug) && isCombinationReplication(row))) throw new PostgresError({ code: "INVALID_REPLICATION_EDIT", message: `The work ${slug} is not eligible for this collection.` })
    }
    const now = new Date().toISOString();
    if (args.targetKind === "playlist" && stored && "replication_slugs" in stored) {
      await ctx.db.patch(stored._id, { title: args.title.trim(), replication_slugs: args.slugs, updated_at: now, updated_by: actor.email });
    } else if (args.targetKind === "substance") {
      const substance = await uniqueSubstanceBySlug(ctx, args.targetKey);
      if (!substance) throw new PostgresError({ code: "COLLECTION_NOT_FOUND", message: "The substance no longer exists." });
      const gallery = stored && "curated_slugs" in stored ? stored : null;
      if (gallery?.disabled) throw new PostgresError({ code: "INVALID_REPLICATION_EDIT", message: "This drug's showcase is disabled. Change its eligibility before publishing a collection." });
      const members = await getSubstanceGalleryMembers(ctx, substance, gallery);
      if (members.length !== previous.size || members.some(({ row }) => !previous.has(row.slug))) return failConflict();
      // A permutation changes presentation only, never automatic associations.
      // Membership edits retain the existing delta workflow, including exclusions.
      const patch = { carousel_order: args.slugs, updated_at: now, updated_by: actor.email };
      if (orderOnly) {
        if (gallery) await ctx.db.patch(gallery._id, patch);
        else await ctx.db.insert("substanceGalleries", { substance_slug: args.targetKey, curated_slugs: [], removed_slugs: [], ...patch });
      } else {
        const removed = new Set(gallery?.removed_slugs ?? []);
        for (const slug of previous) if (!submitted.has(slug)) removed.add(slug);
        for (const slug of submitted) removed.delete(slug);
        const curated = new Set((gallery?.curated_slugs ?? []).filter(slug => submitted.has(slug)));
        for (const slug of submitted) if (!previous.has(slug)) curated.add(slug);
        if (removed.size > GALLERY_CURATION_SLUG_CAP || curated.size > GALLERY_CURATION_SLUG_CAP) throw new PostgresError({ code: "INVALID_REPLICATION_EDIT", message: "This showcase exceeds the supported association or exclusion limit." });
        const membership = { curated_slugs: [...curated], removed_slugs: [...removed], ...patch };
        if (gallery) await ctx.db.patch(gallery._id, membership);
        else await ctx.db.insert("substanceGalleries", { substance_slug: args.targetKey, ...membership });
      }
    } else if (args.targetKind === "effect" && stored && "slug" in stored) {
      // Effect/artist collections derive membership from canonical metadata; only their order is editable here.
      if (!orderOnly) throw new PostgresError({ code: "INVALID_REPLICATION_EDIT", message: "This collection supports ordering only; membership follows canonical metadata." })
      await ctx.db.patch(stored._id, { gallery_order: args.slugs });
    } else if (args.targetKind === "artist" && stored && "displayName" in stored) {
      if (!orderOnly) throw new PostgresError({ code: "INVALID_REPLICATION_EDIT", message: "This collection supports ordering only; membership follows canonical metadata." })
      await ctx.db.patch(stored._id, { replicationOrder: args.slugs });
    } else throw new PostgresError({ code: "COLLECTION_NOT_FOUND", message: "This collection no longer exists." });
    const published = await collectionRow(ctx, args.targetKind, args.targetKey);
    if (stored && "replication_slugs" in stored) await recordRevision(ctx, { table: "replicationPlaylists", key: args.targetKey, action: "update", before: stored, after: published, actor, operationId: args.requestId });
    if (args.targetKind === "artist" && stored && "displayName" in stored) await recordRevision(ctx, { table: "contributorProfiles", key: args.targetKey, action: "update", before: stored, after: published, actor, operationId: args.requestId });
    const publications = args.targetKind === "playlist" ? [] : args.targetKind === "substance" ? ["dosewiki"] : ["dosewiki", "effectindex"];
    const resultRevision = await ctx.db.insert("replicationEditReceipts", { requestId: args.requestId, actorEmail: actor.email, actorRole: actor.role, operation: "collection-curation", expectedRevision: args.expectedRevision, publications, target, before: replicationJournalSnapshot(stored), after: { requested: after, stored: replicationJournalSnapshot(published) }, createdAt: now });
    return { ok: true, reconciled: false, resultRevision };
  },
});
