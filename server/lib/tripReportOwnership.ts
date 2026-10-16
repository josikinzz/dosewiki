import { PostgresError } from "../../lib/postgres/runtime/values"
import type { Doc } from "../../lib/postgres/runtime/dataModel"
import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import type { AuthorizedActor } from "./auth";

export function ownsReport(actor: AuthorizedActor, report: Doc<"tripReports">): boolean {
  return actor.role === "admin" || report.owner_email === actor.email;
}

export function refuseNotOwner(report: Doc<"tripReports">): never {
  throw new PostgresError({
    code: "NOT_OWNER",
    message: `You do not own trip report ${report.slug}.`,
  });
}

export async function findMembershipByEmail(ctx: QueryCtx | MutationCtx, email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return await ctx.db
    .query("memberships")
    .withIndex("by_email", (q) => q.eq("email", normalized))
    .unique();
}
