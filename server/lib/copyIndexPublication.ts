import { PostgresError } from "../../lib/postgres/runtime/values"
import { contentHash } from "../../lib/proposals/contentHash";
import { proposalComparableDocument, type ProposalBaseline } from "../../lib/proposals/proposalBaseline";
import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import type { AuthorizedActor } from "./auth";

type Table = "copyBlocks" | "siteConfig" | "indexLayouts";
export function copyIndexContentEqual(kind: ProposalBaseline["kind"], before: unknown, after: unknown) {
  const stripRevision = (value: unknown) => {
    const comparable = proposalComparableDocument(kind, value);
    if (!comparable || typeof comparable !== "object") return comparable;
    const { revision: _revision, ...content } = comparable as Record<string, unknown>;
    return content;
  };
  return contentHash(stripRevision(before)) === contentHash(stripRevision(after));
}
export async function copyIndexRevision(ctx: MutationCtx | QueryCtx, table: Table, key: string): Promise<number> {
  const latest = await ctx.db.query("contentRevisions").withIndex("by_table_key", (q) => q.eq("table", table).eq("key", key)).order("desc").first();
  return Number(latest?.revision ?? 0);
}
export async function prepareCopyIndexPublication(ctx: MutationCtx, input: { table: Table; kind: ProposalBaseline["kind"]; key: string; before: unknown; after: unknown; expected?: unknown; expectedRevision?: number; operationId?: string; actor: AuthorizedActor }) {
  const requestIdentity = contentHash({ key: input.key, after: proposalComparableDocument(input.kind, input.after), expected: input.expected, expectedRevision: input.expectedRevision });
  if (input.operationId) {
    const receipt = await ctx.db.query("contentRevisions").withIndex("by_operation", (q) => q.eq("table", input.table).eq("key", input.key).eq("operationId", input.operationId)).unique();
    if (receipt) {
      if (receipt.actorEmail !== input.actor.email || receipt.requestIdentity !== requestIdentity) throw new PostgresError({ code: "EDIT_OPERATION_REUSED", message: "This operation ID belongs to a different actor or request. Keep your draft and reload the latest publication receipt." });
      return { replayed: receipt, revision: Number(receipt.revision), requestIdentity };
    }
  }
  const revision = await copyIndexRevision(ctx, input.table, input.key);
  if ((input.expectedRevision !== undefined && input.expectedRevision !== revision) || (input.expected !== undefined && !copyIndexContentEqual(input.kind, input.before, input.expected))) {
    throw new PostgresError({ code: "EDIT_CONFLICT", message: "Published content changed since you opened this editor. Your draft is preserved. Reload the latest source and reconcile before publishing." });
  }
  return { replayed: null, revision, requestIdentity };
}
export async function journalCopyIndex(ctx: MutationCtx, input: { table: Table; key: string; before: unknown; after: unknown; actor: AuthorizedActor; revision: number; operationId?: string; requestIdentity: string }) {
  await ctx.db.insert("contentRevisions", {
    table: input.table, key: input.key, action: input.before ? (input.after ? "update" : "remove") : "create",
    before: input.before ?? null, after: input.after ?? null, actorEmail: input.actor.email, actorRole: input.actor.role,
    revision: String(input.revision), operationId: input.operationId, requestIdentity: input.requestIdentity,
    createdAt: new Date().toISOString(),
  });
}
