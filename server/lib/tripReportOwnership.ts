import { PostgresError } from "../../lib/postgres/runtime/values"
import type { Doc } from "../../lib/postgres/runtime/dataModel"
import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import type { AuthorizedActor } from "./auth";

/**
 * Ownership predicate for the contributor floor. An admin reaches any report;
 * a contributor reaches only the rows that carry their email. Editors get no
 * ownership of their own: the portal path grants them a broader write at the
 * editor floor, checked at each call site. Emails on both sides are stored
 * normalized (lowercase, trimmed) so this is a plain comparison.
 */
export function ownsReport(actor: AuthorizedActor, report: Doc<"tripReports">): boolean {
  return actor.role === "admin" || report.owner_email === actor.email;
}

export function refuseNotOwner(report: Doc<"tripReports">): never {
  throw new PostgresError({
    code: "NOT_OWNER",
    message: `You do not own trip report ${report.slug}.`,
  });
}

/** Case-insensitive membership lookup, or null when no member has that email. */
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
