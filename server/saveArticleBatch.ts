import { mutation } from "../lib/postgres/runtime/server";
import { v } from "../lib/postgres/runtime/values";
import { api, type FunctionReturnType } from "../lib/postgres/runtime/api";
import { indexLayoutValidator, substanceArticleLightValidator } from "./lib/validators";
import { requireRole } from "./lib/auth";

/** One editor save is one database transaction, including its history row. */
export const save = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.string(),
    articles: v.array(substanceArticleLightValidator),
    indexLayouts: v.array(v.object({
      ...indexLayoutValidator.fields,
      expected: v.optional(v.any()),
      expectedRevision: v.optional(v.number()),
      operationId: v.optional(v.string()),
    })),
    changelog: v.optional(v.object({
      entryId: v.string(),
      createdAt: v.string(),
      message: v.string(),
      markdown: v.string(),
      submittedBy: v.union(v.string(), v.null()),
      articles: v.array(v.object({ id: v.number(), title: v.string(), slug: v.string() })),
    })),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" }, "admin");
    const articleResult = args.articles.length > 0
      ? await ctx.runMutation(api.substanceIndex.saveSubstances, {
          apiKey: args.apiKey, actorEmail: args.actorEmail, articles: args.articles,
        })
      : null;
    if (articleResult?.errors.length) {
      throw new Error(`Article save failed: ${articleResult.errors.join("; ")}`);
    }
    const layoutResults: Array<{
      type: (typeof args.indexLayouts)[number]["type"];
      receipt: FunctionReturnType<typeof api.indexLayouts.save>;
    }> = [];
    for (const layout of args.indexLayouts) {
      const receipt = await ctx.runMutation(api.indexLayouts.save, {
        apiKey: args.apiKey, actorEmail: args.actorEmail, ...layout,
      });
      layoutResults.push({ type: layout.type, receipt });
    }
    const savedArticleCount = (articleResult?.created ?? 0) + (articleResult?.updated ?? 0);
    if (savedArticleCount > 0 && args.changelog) {
      await ctx.runMutation(api.changelog.addEntry, {
        apiKey: args.apiKey, actorEmail: args.actorEmail, ...args.changelog,
      });
    }
    return { articleResult, layoutResults, changelogSaved: savedArticleCount > 0 && Boolean(args.changelog) };
  },
});
