import type { Doc, Id } from "../../lib/postgres/runtime/dataModel"
import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import { contentHash, stableStringify } from "../../lib/proposals/contentHash";
import { normalizeProfileKey } from "./contributorProfiles";

export async function latestReplicationEdit(ctx: QueryCtx | MutationCtx, target: string) {
  return ctx.db.query("replicationEditReceipts").withIndex("by_target", q => q.eq("target", target)).order("desc").first();
}

export async function replicationRevision(ctx: QueryCtx | MutationCtx, row: unknown, target: string) {
  const latest = await latestReplicationEdit(ctx, target);
  const separator = target.indexOf(":");
  const kind = target.slice(0, separator);
  const key = target.slice(separator + 1);
  const domainRevision = kind === "artist" || kind === "playlist"
    ? await ctx.db.query("contentRevisions").withIndex("by_table_key", q => q.eq("table", kind === "artist" ? "contributorProfiles" : "replicationPlaylists").eq("key", key)).order("desc").first()
    : kind === "effect" ? await ctx.db.query("narrativeRevisions").withIndex("by_target", q => q.eq("kind", "effect").eq("key", key)).order("desc").first() : null;
  return contentHash({ row, publication: latest?._id ?? null, ...(domainRevision ? { domainPublication: domainRevision._id } : {}) });
}

const tables = ["replications", "substanceGalleries", "subjectiveEffects", "contributorProfiles", "replicationPlaylists"] as const;
type Table = typeof tables[number];
type Row = Doc<Table>;
function targetOf(row: Row, table: Table): string {
  if (table === "replications") return `replication:${row._id}`;
  if ("substance_slug" in row) return `substance:${row.substance_slug}`;
  if ("slug" in row) return `effect:${row.slug}`;
  if ("displayName" in row) return `artist:${normalizeProfileKey(row.key)}`;
  return `playlist:${row.key}`;
}

export function replicationJournalSnapshot(row: Row | null): unknown {
  if (!row) return null;
  if ("displayName" in row) return { key: row.key, replicationOrder: row.replicationOrder ?? [] };
  if ("name" in row) return { slug: row.slug, gallery_order: row.gallery_order ?? [] };
  return row;
}

/** One journal generation per touched target, including retained maintenance writers.
 * Contextual mutations already record their exact request, so their receipt wins.
 */
export function withReplicationEditJournal(ctx: MutationCtx) {
  let failure: { error: unknown } | null = null;
  const changes = new Map<string, { before: unknown; id: Id<Table>; receipt: string | null; expectedRevision: string }>();
  async function capture(target: string, before: Row | null, id: Id<Table>) {
    if (changes.has(target)) return;
    changes.set(target, { before: replicationJournalSnapshot(before), id, receipt: (await latestReplicationEdit(ctx, target))?._id ?? null, expectedRevision: await replicationRevision(ctx, before, target) });
  }
  const db = new Proxy(ctx.db, {
    get(writer, property, receiver) {
      const method = Reflect.get(writer, property, receiver);
      if (property !== "insert" && property !== "patch" && property !== "replace" && property !== "delete") return typeof method === "function" ? method.bind(writer) : method;
      return async (...args: unknown[]) => {
        const inserted = property === "insert";
        const explicitTable = inserted || args.length === (property === "delete" ? 2 : 3);
        const id = inserted ? null : args[explicitTable ? 1 : 0] as string;
        const table = tables.find(table => explicitTable ? args[0] === table : writer.normalizeId(table, id!) !== null);
        if (!table) return Reflect.apply(method, writer, args);
        try {
        if (property === "patch" && (table === "subjectiveEffects" || table === "contributorProfiles" || table === "replications")) {
          const patch = args[explicitTable ? 2 : 1] as Record<string, unknown>;
          const fields = table === "subjectiveEffects" ? ["slug", "gallery_order"] : table === "contributorProfiles" ? ["key", "replicationOrder"] : ["slug", "title", "artist", "role", "effect_slug", "credit_line", "effect_tags", "source_url"];
          if (!fields.some(field => Object.prototype.hasOwnProperty.call(patch, field))) return Reflect.apply(method, writer, args);
        }
        const sourceId = id === null ? null : writer.normalizeId(table, id);
        const before = sourceId ? await writer.get(sourceId) : null;
        if (before && (property === "patch" || property === "replace") && (table === "subjectiveEffects" || table === "contributorProfiles")) {
          const update = args[explicitTable ? 2 : 1] as Record<string, unknown>;
          const previous: Record<string, unknown> = before;
          const fields = table === "subjectiveEffects" ? ["slug", "gallery_order"] : ["key", "replicationOrder"];
          if (fields.every(field => stableStringify(previous[field]) === stableStringify(property === "patch" && !(field in update) ? previous[field] : update[field]))) return Reflect.apply(method, writer, args);
        }
        if (before) await capture(targetOf(before, table), before, before._id);
        const result = await Reflect.apply(method, writer, args);
        const resultId = sourceId ?? result as Id<Table>;
        const after = property === "delete" ? null : await writer.get(resultId);
        if (after) await capture(targetOf(after, table), before, resultId);
        return result;
        } catch (error) {
          failure = { error };
          throw error;
        }
      };
    },
  });
  return {
    ctx: { ...ctx, db },
    async commit(input: unknown) {
      if (failure) throw failure.error;
      if (!changes.size) return;
      const delegatedEmail = input && typeof input === "object" && "apiKey" in input && typeof input.apiKey === "string" && "actorEmail" in input && typeof input.actorEmail === "string" ? input.actorEmail.trim().toLowerCase() : null;
      const identity = delegatedEmail ? null : await ctx.auth.getUserIdentity();
      const actorEmail = delegatedEmail ?? identity?.email?.trim().toLowerCase() ?? "system";
      const member = actorEmail === "system" ? null : await ctx.db.query("memberships").withIndex("by_email", q => q.eq("email", actorEmail)).first();
      for (const [target, change] of changes) {
        if (((await latestReplicationEdit(ctx, target))?._id ?? null) !== change.receipt) continue;
        const stored = replicationJournalSnapshot(await ctx.db.get(change.id));
        await ctx.db.insert("replicationEditReceipts", {
          requestId: `retained-${contentHash({ target, previous: change.receipt, stored })}`, actorEmail, actorRole: member?.role ?? "service",
          operation: target.startsWith("replication:") ? "canonical-metadata" : "collection-curation",
          expectedRevision: change.expectedRevision,
          publications: target.startsWith("playlist:") ? [] : target.startsWith("substance:") ? ["dosewiki"] : ["dosewiki", "effectindex"],
          target, before: change.before, after: { stored }, createdAt: new Date().toISOString(),
        });
      }
    },
  };
}
