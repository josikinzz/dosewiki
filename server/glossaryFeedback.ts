import { PostgresError, v } from "../lib/postgres/runtime/values";
import { query, type QueryCtx } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import { approvedGlossaryLocales, canAccessGlossaryLocale } from "../src/lib/auth/roles";
import {
  glossaryLanguage,
  renderingVersion,
} from "../src/features/language-glossary/languageGlossary";
import {
  SITE_FEEDBACK_PENDING_STATUSES,
  SITE_FEEDBACK_STATUS_TRANSITIONS,
} from "../src/features/site-feedback/siteFeedback";
import {
  glossaryFeedbackStatus,
  glossaryReactionChoice,
} from "./lib/glossaryFeedbackValidators";
import { assertDataWritesNotFrozen } from "../lib/runtime/dataWriteFreeze";

const identityArgs = {
  locale: v.string(),
  term: v.string(),
  version: v.string(),
  visitor: v.string(),
  id: v.string(),
};
function validateIdentity(args: {
  locale: string;
  term: string;
  version: string;
  visitor: string;
  id: string;
}) {
  if (
    !glossaryLanguage(args.locale) ||
    !args.term.trim() ||
    args.term.length > 200 ||
    args.version.length > 3000 ||
    !/^[a-f0-9]{64}$/.test(args.visitor) ||
    !/^[a-f0-9-]{36}$/.test(args.id)
  )
    throw new PostgresError("Invalid glossary feedback identity.");
}
async function snapshot(
  ctx: QueryCtx,
  args: { locale: string; term: string; version: string },
) {
  const row = await ctx.db.getGlossaryRendering(args.locale, args.term);
  if (!row) throw new PostgresError("Unknown glossary term.");
  if (renderingVersion(row) !== args.version)
    throw new PostgresError({
      code: "CONFLICT",
      message: "This translation changed. Reload before submitting feedback.",
    });
  return {
    locale: args.locale,
    term: args.term,
    target: row.target,
    version: args.version,
  };
}
async function requireLocale(
  ctx: QueryCtx,
  args: { apiKey: string; actorEmail: string; locale: string },
) {
  const actor = await requireRole(
    ctx,
    { ...args, adminIntent: "editorArticleWrite" },
    "translator",
  );
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_email", (q) => q.eq("email", actor.email))
    .unique();
  if (
    !canAccessGlossaryLocale(
      { role: actor.role, glossaryLocales: membership?.glossaryLocales },
      args.locale,
    )
  )
    throw new PostgresError("Glossary language access denied.");
  return actor;
}
export const create = mutation({
  args: {
    apiKey: v.string(),
    ...identityArgs,
    details: v.string(),
    alternative: v.string(),
    honeypot: v.boolean(),
  },
  handler: async (ctx, args) => {
    assertDataWritesNotFrozen("glossaryFeedback:create");
    await requireRole(
      ctx,
      { apiKey: args.apiKey, adminIntent: "publicIntakeCreate" },
      "editor",
    );
    validateIdentity(args);
    if (
      (!args.details.trim() && !args.alternative.trim()) ||
      args.details.length > 4000 ||
      args.alternative.length > 400
    )
      throw new PostgresError(
        "Add a comment (up to 4000 characters) or alternative (up to 400 characters).",
      );
    const existing = await ctx.db
      .query("glossaryFeedback")
      .withIndex("by_visitor_id", (q) =>
        q.eq("visitor", args.visitor).eq("id", args.id),
      )
      .unique();
    if (existing) {
      if (
        existing.locale !== args.locale ||
        existing.term !== args.term ||
        existing.version !== args.version ||
        existing.details !== args.details ||
        existing.alternative !== args.alternative
      )
        throw new PostgresError("Submission identity already used.");
      return { id: existing.id };
    }
    const reviewed = await snapshot(ctx, args);
    await ctx.db.insert("glossaryFeedback", {
      ...reviewed,
      id: args.id,
      visitor: args.visitor,
      details: args.details,
      alternative: args.alternative,
      status: args.honeypot ? "spam" : "new",
      created_at: new Date().toISOString(),
    });
    return { id: args.id };
  },
});
/** A new event replaces the effective choice. Existing rows are never updated by public intake. */
export const createReaction = mutation({
  args: { apiKey: v.string(), ...identityArgs, choice: glossaryReactionChoice },
  handler: async (ctx, args) => {
    assertDataWritesNotFrozen("glossaryFeedback:createReaction");
    await requireRole(
      ctx,
      { apiKey: args.apiKey, adminIntent: "publicIntakeCreate" },
      "editor",
    );
    validateIdentity(args);
    const existing = await ctx.db
      .query("glossaryReactionEvents")
      .withIndex("by_visitor_id", (q) =>
        q.eq("visitor", args.visitor).eq("id", args.id),
      )
      .unique();
    if (existing) {
      if (
        existing.locale !== args.locale ||
        existing.term !== args.term ||
        existing.version !== args.version ||
        existing.choice !== args.choice
      )
        throw new PostgresError("Submission identity already used.");
      return { choice: existing.choice };
    }
    const reviewed = await snapshot(ctx, args);
    const latest = await ctx.db
      .query("glossaryReactionEvents")
      .withIndex("by_version_visitor", (q) =>
        q
          .eq("locale", args.locale)
          .eq("term", args.term)
          .eq("version", args.version)
          .eq("visitor", args.visitor),
      )
      .order("desc")
      .first();
    await ctx.db.insert("glossaryReactionEvents", {
      ...reviewed,
      id: args.id,
      visitor: args.visitor,
      choice: args.choice,
      created_at: Math.max(Date.now(), (latest?.created_at ?? 0) + 1),
    });
    return { choice: args.choice };
  },
});
/** The newest rows `list` returns per locale; the pending count reads the same window. */
const LIST_WINDOW = 250;
function newestForLocale(ctx: QueryCtx, locale: string) {
  return ctx.db
    .query("glossaryFeedback")
    .withIndex("by_locale_created", (q) => q.eq("locale", locale))
    .order("desc")
    .take(LIST_WINDOW);
}
export const list = query({
  args: { apiKey: v.string(), actorEmail: v.string(), locale: v.string() },
  handler: async (ctx, args) => {
    await requireLocale(ctx, args);
    const rows = await newestForLocale(ctx, args.locale);
    return rows.map(
      ({ visitor: _visitor, _id, _creationTime: _time, ...row }) => ({
        ...row,
        id: _id,
      }),
    );
  },
});
/**
 * Pending glossary feedback across every locale this reviewer may open, for
 * the `/dev` rail badge. It counts inside the window `list` returns, so the
 * badge never names a row the Glossary queue cannot show.
 */
export const pendingCount = query({
  args: { apiKey: v.string(), actorEmail: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireRole(
      ctx,
      { ...args, adminIntent: "editorArticleWrite" },
      "translator",
    );
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_email", (q) => q.eq("email", actor.email))
      .unique();
    const pending: readonly string[] = SITE_FEEDBACK_PENDING_STATUSES;
    let total = 0;
    for (const locale of approvedGlossaryLocales({
      role: actor.role,
      glossaryLocales: membership?.glossaryLocales,
    })) {
      const rows = await newestForLocale(ctx, locale);
      total += rows.filter((row) => pending.includes(row.status)).length;
    }
    return total;
  },
});
export const reactions = query({
  args: { apiKey: v.string(), actorEmail: v.string(), locale: v.string() },
  handler: async (ctx, args) => {
    await requireLocale(ctx, args);
    return ctx.db.getGlossaryReactionTotals(args.locale);
  },
});
export const transition = mutation({
  args: {
    apiKey: v.string(),
    actorEmail: v.string(),
    id: v.id("glossaryFeedback"),
    status: glossaryFeedbackStatus,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertDataWritesNotFrozen("glossaryFeedback:transition");
    const row = await ctx.db.get(args.id);
    if (!row) throw new PostgresError("Glossary feedback not found.");
    const actor = await requireLocale(ctx, { ...args, locale: row.locale });
    if (!SITE_FEEDBACK_STATUS_TRANSITIONS[row.status].includes(args.status))
      throw new PostgresError("Invalid feedback status transition.");
    if ((args.note?.length ?? 0) > 4000)
      throw new PostgresError("Review note is too long.");
    const patch = {
      status: args.status,
      review_notes: args.note ?? row.review_notes,
      reviewed_by: actor.email,
      reviewed_at: new Date().toISOString(),
    };
    await ctx.db.patch(row._id, patch);
    const { visitor: _visitor, _id, _creationTime: _time, ...safe } = row;
    return { ...safe, ...patch, id: _id };
  },
});
