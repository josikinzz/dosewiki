import type { Doc, TableNames } from "../../lib/postgres/runtime/dataModel"
import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import type { AuthorizedActor } from "./auth";

export type RevisionedTable = "contributorProfiles" | "replicationPlaylists" | "tripReports";
export type RevisionAction = "update" | "remove" | "merge" | "create";

/**
 * Journal the document as it stands before a write lands on it. Every write
 * path for the three member-owned tables calls this, whoever the actor is, so
 * a contributor trimming their profile or dropping a playlist leaves the old
 * version on the server. `_id` and `_creationTime` ride along in `before` so a
 * restore can tell which row it came from.
 */
export async function recordRevision<T extends RevisionedTable & TableNames>(
  ctx: MutationCtx,
  input: { table: T; key: string; action: RevisionAction; before: Doc<T> | null; actor: Pick<AuthorizedActor, "email" | "role">; after?: unknown; operationId?: string; revision?: string; publications?: string[]; requestIdentity?: string; clientRequestIdentity?: string },
): Promise<void> {
  await ctx.db.insert("contentRevisions", {
    table: input.table,
    key: input.key,
    action: input.action,
    before: input.before,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    createdAt: new Date().toISOString(),
    ...(input.after !== undefined ? { after: input.after } : {}),
    ...(input.operationId ? { operationId: input.operationId } : {}),
    ...(input.revision ? { revision: input.revision } : {}),
    ...(input.publications ? { publications: input.publications } : {}),
    ...(input.requestIdentity ? { requestIdentity: input.requestIdentity } : {}),
    ...(input.clientRequestIdentity ? { clientRequestIdentity: input.clientRequestIdentity } : {}),
  });
}

/** Read only after the domain has authorized this actor against this record. */
export async function findRevisionOperation(
  ctx: MutationCtx | QueryCtx,
  table: RevisionedTable,
  key: string,
  operationId: string | undefined,
  actorEmail: string,
) {
  if (!operationId) return null;
  const revision = await ctx.db.query("contentRevisions")
    .withIndex("by_operation", (q) => q.eq("table", table).eq("key", key).eq("operationId", operationId))
    .unique();
  if (revision && revision.actorEmail !== actorEmail) throw new Error("Operation belongs to another actor.");
  return revision;
}
