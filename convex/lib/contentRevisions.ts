import type { Doc, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { AuthorizedActor } from "./auth";

export type RevisionedTable = "contributorProfiles" | "replicationPlaylists" | "tripReports";
export type RevisionAction = "update" | "remove" | "merge";

/**
 * Journal the document as it stands before a write lands on it. Every write
 * path for the three member-owned tables calls this, whoever the actor is, so
 * a contributor trimming their profile or dropping a playlist leaves the old
 * version on the server. `_id` and `_creationTime` ride along in `before` so a
 * restore can tell which row it came from.
 */
export async function recordRevision<T extends RevisionedTable & TableNames>(
  ctx: MutationCtx,
  input: { table: T; key: string; action: RevisionAction; before: Doc<T>; actor: Pick<AuthorizedActor, "email" | "role"> },
): Promise<void> {
  await ctx.db.insert("contentRevisions", {
    table: input.table,
    key: input.key,
    action: input.action,
    before: input.before,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    createdAt: new Date().toISOString(),
  });
}
