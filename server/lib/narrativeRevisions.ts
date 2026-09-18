import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import type { AuthorizedActor } from "./auth";
import { contentHash } from "../../lib/proposals/contentHash";
import { PostgresError } from "../../lib/postgres/runtime/values"

/** Receipt identity prevents A→B→A edits from recreating an earlier baseline. */
export function narrativeRevision(document: Record<string, unknown> | null, operationId: string | null = null): string {
  return document === null ? contentHash(null) : contentHash({ document, operationId });
}

export async function currentNarrativeRevision(ctx: MutationCtx | QueryCtx, kind: "effect" | "writing", document: Record<string, unknown> | null): Promise<string> {
  if (!document) return narrativeRevision(null);
  const latest = await ctx.db.query("narrativeRevisions").withIndex("by_document", q => q.eq("kind", kind).eq("documentId", String(document._id))).order("desc").first();
  return narrativeRevision(document, latest?.operationId ?? null);
}

/** Maintenance writes advance the same identity even though they are not editor requests. */
export async function recordNarrativeMaintenance(ctx: MutationCtx, input: {
  kind: "effect" | "writing"; key: string;
  actor: Pick<AuthorizedActor, "email" | "role">;
  before: Record<string, unknown> | null; after: Record<string, unknown>;
}): Promise<string> {
  const baseRevision = await currentNarrativeRevision(ctx, input.kind, input.before);
  if (contentHash(input.before) === contentHash(input.after)) return baseRevision;
  const requestHash = contentHash(input.after);
  return recordNarrativeRevision(ctx, { ...input, baseRevision, requestHash, operationId: contentHash({ baseRevision, requestHash }) });
}

/** Narrative history stores changed source fields, not duplicate derived ASTs. */
export async function recordNarrativeRevision(ctx: MutationCtx, input: {
  kind: "effect" | "writing"; key: string; operationId: string; requestHash: string; baseRevision: string;
  actor: Pick<AuthorizedActor, "email" | "role">;
  before: Record<string, unknown> | null; after: Record<string, unknown>;
}) {
  const revision = narrativeRevision(input.after, input.operationId);
  const fields = [...new Set([...Object.keys(input.before ?? {}), ...Object.keys(input.after)])].filter(key => !key.startsWith("_") && !key.endsWith("_ast") && contentHash(input.before?.[key]) !== contentHash(input.after[key]));
  const before = input.before ? Object.fromEntries(fields.map(key => [key, input.before![key] ?? null])) : null;
  const after = { ...Object.fromEntries(fields.map(key => [key, input.after[key] ?? null])), slug: input.after.slug, _id: input.after._id };
  if (new TextEncoder().encode(JSON.stringify({ before, after })).byteLength > 900_000) throw new PostgresError({ code: "INVALID_WRITING", message: "The changed narrative fields exceed the revision size limit. Publish a smaller set of changes." });
  await ctx.db.insert("narrativeRevisions", {
    kind: input.kind, key: input.key, operationId: input.operationId, requestHash: input.requestHash,
    documentId: String(input.after._id),
    actorEmail: input.actor.email, actorRole: input.actor.role, before, after,
    baseRevision: input.baseRevision, revision, createdAt: new Date().toISOString(),
    publications: input.kind === "writing" && input.after.kind === "blog" ? ["dosewiki"] : ["dosewiki", "effectindex"],
  });
  return revision;
}
