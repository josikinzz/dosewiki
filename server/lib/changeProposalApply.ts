import { PostgresError } from "../../lib/postgres/runtime/values"
import type { Doc } from "../../lib/postgres/runtime/dataModel"
import type { MutationCtx } from "../../lib/postgres/runtime/server"
import { removeCopyBlockHandler, upsertCopyBlockHandler, type CopyBlockDocument } from "../copyBlocks";
import { saveIndexLayoutHandler } from "../indexLayouts";
import { ABOUT_KEY, saveAboutHandler, type AboutDocument } from "../siteConfig";
import { writeCategoryLayout } from "./categoryLayoutMirror";
import { readProposalTarget, type ProposalTargetRef } from "./changeProposalTargets";
import { saveRevalidationPaths, type IndexLayoutType } from "./saveRevalidationPaths";
import { resolveSubstanceSlug } from "../../src/data/projections/substanceProjectionCore";
import { saveSubstancesHandler } from "./substanceWriteHandlers";
import { requireRole } from "./auth";
import { articleChangePatch, articleDocument, validateArticleChange } from "./articleLifecycleValidation";
import { articleBaseHash, recordArticleRevision } from "./articleRevisionJournal";

/**
 * Writing a change proposal to production, and writing production back.
 *
 * Existing articles use the contextual changed-unit validator, patch, and
 * revision journal. New articles and the other target kinds use their direct
 * save handlers. `applyTarget` is the one switch on target kind.
 */

/** The write credentials the apply inherits from the approving mutation. */
export type ApplyAuth = { apiKey?: string; actorEmail?: string; articleChangeId?: string; articleSummary?: string };

export type ProposalArticleDocument = { id: number | null; title: string; slug?: string } & Record<string, unknown>;

export type ProposalLayoutDocument = {
  type: IndexLayoutType;
  version: number;
  categories: Doc<"indexLayouts">["categories"];
};

/** The body a proposal wraps, as apply reads it. */
export type ProposalPayload = {
  articles?: ProposalArticleDocument[];
  indexLayouts?: ProposalLayoutDocument[];
  copyBlocks?: CopyBlockDocument[];
  about?: AboutDocument;
  changelog?: { markdown: string; articles: Array<{ id: number; title: string; slug: string }> };
};

/** Public paths whose cached copy the About row feeds. */
const ABOUT_REVALIDATION_PATHS = ["/about"];

type CategoryLayoutData = Omit<Doc<"categoryLayout">, "_id" | "_creationTime">;

/**
 * One target's stored document before apply, without editor normalization;
 * `null` when absent. The psychoactive layout also keeps the
 * `categoryLayout` mirror row (`null` when absent), because reverting a layout
 * that did not exist before has no earlier layout to project the mirror from.
 * Entries applied before the mirror was captured leave it `undefined`, and a
 * revert then leaves the mirror alone.
 */
export type ProposalSnapshotEntry = ProposalTargetRef & {
  document: unknown;
  categoryLayout?: CategoryLayoutData | null;
};

/** Keep exact content for restoration; CAS projects article snapshots separately. */
export async function snapshotProposalTarget(
  ctx: MutationCtx,
  target: ProposalTargetRef,
): Promise<ProposalSnapshotEntry> {
  const document = await readProposalTarget(ctx, target, "stored");
  if (target.kind !== "indexLayout" || target.key !== "psychoactive") {
    return { kind: target.kind, key: target.key, document };
  }
  const mirror = await ctx.db.query("categoryLayout").first();
  if (!mirror) {
    return { kind: target.kind, key: target.key, document, categoryLayout: null };
  }
  const { _id: _rowId, _creationTime: _createdAt, ...categoryLayout } = mirror;
  return { kind: target.kind, key: target.key, document, categoryLayout };
}

/**
 * Write one entry's document to production, or remove the target when
 * `document` is `null` (a revert of a proposal that created the row). Returns
 * the public paths the write invalidates.
 */
export async function applyTarget(
  ctx: MutationCtx,
  auth: ApplyAuth,
  target: ProposalSnapshotEntry,
): Promise<{ revalidatePaths: string[] }> {
  const document = target.document;
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
      const existing = await ctx.db.query("substanceIndex").withIndex("by_slug", (q) => q.eq("slug", target.key)).unique();
      if (existing) {
        const actor = await requireRole(ctx, { apiKey: auth.apiKey, actorEmail: auth.actorEmail, adminIntent: "editorArticleWrite" }, "admin");
        const before = articleDocument(existing);
        const after = validateArticleChange(before, document, true, auth.articleChangeId?.startsWith("revert-") === true);
        const baseHash = await articleBaseHash(ctx, before);
        await ctx.db.patch(existing._id, articleChangePatch(before, after));
        await recordArticleRevision(ctx, {
          before, after, actor, baseHash,
          changeId: `${auth.articleChangeId ?? "proposal"}:${target.key}`,
          summary: auth.articleSummary ?? "Applied article proposal",
          publicChangelog: false,
        });
        return { revalidatePaths: saveRevalidationPaths([`/${target.key}`, "/substances"], []) };
      }
      const result = await saveSubstancesHandler(ctx, {
        apiKey: auth.apiKey,
        actorEmail: auth.actorEmail,
        articles: [document as ProposalArticleDocument],
      });
      if (result.errors.length > 0) {
        throw new PostgresError({
          code: "PROPOSAL_APPLY_FAILED",
          message: result.errors.join(" "),
        });
      }
      return { revalidatePaths: result.affectedPaths };
    }
    case "indexLayout": {
      const type = target.key as IndexLayoutType;
      if (document === null) {
        // The layout row did not exist when the proposal was drafted, so the
        // public grid's mirror is put back from its own snapshot rather than
        // projected from a layout.
        const row = await ctx.db
          .query("indexLayouts")
          .withIndex("by_type", (q) => q.eq("type", type))
          .first();
        if (row) {
          await ctx.db.delete(row._id);
        }
        if (target.categoryLayout) {
          await writeCategoryLayout(ctx, target.categoryLayout);
        } else if (target.categoryLayout === null) {
          const mirror = await ctx.db.query("categoryLayout").first();
          if (mirror) {
            await ctx.db.delete(mirror._id);
          }
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
    case "about": {
      if (document === null) {
        const row = await ctx.db
          .query("siteConfig")
          .withIndex("by_key", (q) => q.eq("key", ABOUT_KEY))
          .first();
        if (row) {
          await ctx.db.delete(row._id);
        }
      } else {
        // Both a payload document and a `snapshotBefore` row land here; the
        // handler reads only the three editable fields, so a stored row's
        // `key`, `updatedAt`, and `updatedBy` fall away and the approver is
        // recorded as the writer.
        const about = document as AboutDocument;
        await saveAboutHandler(ctx, {
          apiKey: auth.apiKey,
          actorEmail: auth.actorEmail,
          aboutMarkdown: about.aboutMarkdown,
          aboutSubtitle: about.aboutSubtitle,
          founderProfileKeys: about.founderProfileKeys,
          updatedBy: auth.actorEmail,
        });
      }
      return { revalidatePaths: ABOUT_REVALIDATION_PATHS };
    }
    case "copyBlock": {
      if (document === null) {
        await removeCopyBlockHandler(ctx, { apiKey: auth.apiKey, actorEmail: auth.actorEmail, key: target.key });
      } else {
        const block = document as CopyBlockDocument;
        await upsertCopyBlockHandler(ctx, {
          apiKey: auth.apiKey,
          actorEmail: auth.actorEmail,
          key: target.key,
          flavor: block.flavor,
          kind: block.kind,
          body: block.body,
          items: block.items,
          label: block.label,
          group: block.group,
          updatedBy: auth.actorEmail,
        });
      }
      // Cache invalidation signal consumed by the Next adapter, not a route.
      return { revalidatePaths: ["/copy-blocks"] };
    }
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
  for (const block of payload.copyBlocks ?? []) {
    documents.push({ kind: "copyBlock", key: block.key.trim(), document: block });
  }
  if (payload.about) {
    documents.push({ kind: "about", key: ABOUT_KEY, document: payload.about });
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
    const { revalidatePaths } = await applyTarget(ctx, auth, entry);
    paths.push(...revalidatePaths);
  }
  return saveRevalidationPaths(paths, []);
}
