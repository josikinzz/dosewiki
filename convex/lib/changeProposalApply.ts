import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { saveIndexLayoutHandler } from "../indexLayouts";
import type { ProposalTargetRef } from "./changeProposalTargets";
import { saveRevalidationPaths, type IndexLayoutType } from "./saveRevalidationPaths";
import { resolveSubstanceSlug } from "./substanceProjectionCore";
import { saveSubstancesHandler } from "./substanceWriteHandlers";

/**
 * Writing a change proposal to production, and writing production back.
 *
 * Every write goes through the handler the admin's direct save already uses
 * (`saveSubstancesHandler`, `saveIndexLayoutHandler`), so an applied proposal
 * is indistinguishable from a save-to-convex call: same validation, same
 * reference merge, same `categoryLayout` mirror. `applyTarget` is the one
 * switch on target kind; wave 3 adds `about` and `copyBlock` there.
 */

/** The write credentials the apply inherits from the approving mutation. */
export type ApplyAuth = { apiKey?: string; actorEmail?: string };

export type ProposalArticleDocument = { id: number | null; title: string; slug?: string } & Record<string, unknown>;

export type ProposalLayoutDocument = {
  type: IndexLayoutType;
  version: number;
  categories: Doc<"indexLayouts">["categories"];
};

/** The save-to-convex body a proposal wraps, as apply reads it. */
export type ProposalPayload = {
  articles?: ProposalArticleDocument[];
  indexLayouts?: ProposalLayoutDocument[];
  changelog?: { markdown: string; articles: Array<{ id: number; title: string; slug: string }> };
};

/** One target's live document as `readProposalTarget` returned it before apply; `null` when absent. */
export type ProposalSnapshotEntry = ProposalTargetRef & { document: unknown };

/**
 * Write one target's document to production, or remove the target when
 * `document` is `null` (a revert of a proposal that created the row). Returns
 * the public paths the write invalidates.
 */
export async function applyTarget(
  ctx: MutationCtx,
  auth: ApplyAuth,
  target: ProposalTargetRef,
  document: unknown,
): Promise<{ revalidatePaths: string[] }> {
  switch (target.kind) {
    case "article": {
      if (document === null) {
        const row = await ctx.db
          .query("substanceIndex")
          .withIndex("by_slug", (q) => q.eq("slug", target.key))
          .first();
        if (row) {
          await ctx.db.delete(row._id);
        }
        return { revalidatePaths: saveRevalidationPaths(["/substances", `/${target.key}`], []) };
      }
      const result = await saveSubstancesHandler(ctx, {
        apiKey: auth.apiKey,
        actorEmail: auth.actorEmail,
        articles: [document as ProposalArticleDocument],
      });
      if (result.errors.length > 0) {
        throw new ConvexError({
          code: "PROPOSAL_APPLY_FAILED",
          message: result.errors.join(" "),
        });
      }
      return { revalidatePaths: result.affectedPaths };
    }
    case "indexLayout": {
      const type = target.key as IndexLayoutType;
      if (document === null) {
        // The layout row did not exist when the proposal was drafted. The
        // `categoryLayout` mirror keeps whatever the apply projected into it:
        // there is no earlier layout to project back.
        const row = await ctx.db
          .query("indexLayouts")
          .withIndex("by_type", (q) => q.eq("type", type))
          .first();
        if (row) {
          await ctx.db.delete(row._id);
        }
      } else {
        const layout = document as ProposalLayoutDocument;
        await saveIndexLayoutHandler(ctx, {
          apiKey: auth.apiKey,
          actorEmail: auth.actorEmail,
          type: layout.type,
          version: layout.version,
          categories: layout.categories,
        });
      }
      return { revalidatePaths: saveRevalidationPaths([], [type]) };
    }
    case "about":
    case "copyBlock":
      throw new ConvexError({
        code: "PROPOSAL_KIND_UNSUPPORTED",
        message: `Applying ${target.kind} proposals is not supported yet.`,
      });
  }
}

/** The (target, document) pairs a payload writes, in payload order. */
export function payloadDocuments(payload: ProposalPayload): ProposalSnapshotEntry[] {
  const documents: ProposalSnapshotEntry[] = [];
  for (const article of payload.articles ?? []) {
    documents.push({ kind: "article", key: resolveSubstanceSlug(article), document: article });
  }
  for (const layout of payload.indexLayouts ?? []) {
    documents.push({ kind: "indexLayout", key: layout.type, document: layout });
  }
  return documents;
}

/** Apply every document in order; the union of the paths each write invalidates. */
export async function applyDocuments(
  ctx: MutationCtx,
  auth: ApplyAuth,
  documents: readonly ProposalSnapshotEntry[],
): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of documents) {
    const { revalidatePaths } = await applyTarget(ctx, auth, entry, entry.document);
    paths.push(...revalidatePaths);
  }
  return saveRevalidationPaths(paths, []);
}
