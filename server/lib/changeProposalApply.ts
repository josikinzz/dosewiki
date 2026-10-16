import type { Doc } from "../../lib/postgres/runtime/dataModel"
import type { MutationCtx } from "../../lib/postgres/runtime/server"
import { removeCopyBlockHandler, upsertCopyBlockHandler, type CopyBlockDocument } from "../copyBlocks";
import { saveIndexLayoutHandler } from "../indexLayouts";
import { ABOUT_KEY, saveAboutHandler, type AboutDocument } from "../siteConfig";
import { upsertWritingArticleHandler, writingUpsertFields, type WritingProposalDocument } from "../effectIndexArticles";
import { contentHash } from "../../lib/proposals/contentHash";
import { currentNarrativeRevision, recordNarrativeMaintenance } from "./narrativeRevisions";
import { writeCategoryLayout } from "./categoryLayoutMirror";
import { readProposalTarget, type ProposalTargetRef } from "./changeProposalTargets";
import { saveRevalidationPaths, type IndexLayoutType } from "./saveRevalidationPaths";
import { resolveSubstanceSlug } from "../../src/data/projections/substanceProjectionCore";
import { requireRole } from "./auth";
import { articleDocument } from "./articleLifecycleValidation";
import { articleBaseHash } from "./articleRevisionJournal";
import { writeArticle } from "./articleWrite";

export type ApplyAuth = { apiKey?: string; actorEmail?: string; articleChangeId?: string; articleSummary?: string };

export type ProposalArticleDocument = { id: number | null; title: string; slug?: string } & Record<string, unknown>;

export type ProposalLayoutDocument = {
  type: IndexLayoutType;
  version: number;
  categories: Doc<"indexLayouts">["categories"];
};

export type ProposalPayload = {
  articles?: ProposalArticleDocument[];
  indexLayouts?: ProposalLayoutDocument[];
  copyBlocks?: CopyBlockDocument[];
  about?: AboutDocument;
  writing?: WritingProposalDocument;
  changelog?: { markdown: string; articles: Array<{ id: number; title: string; slug: string }> };
};

const ABOUT_REVALIDATION_PATHS = ["/about"];

export function writingRevalidationPaths(slug: string, kind: unknown): string[] {
  return kind === "blog" ? ["/articles"] : ["/articles", `/articles/${slug}`];
}

function proposalOperationId(changeId: string, key: string): string {
  const hash = contentHash(`${changeId}:${key}`);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

type CategoryLayoutData = Omit<Doc<"categoryLayout">, "_id" | "_creationTime">;

export type ProposalSnapshotEntry = ProposalTargetRef & {
  document: unknown;
  categoryLayout?: CategoryLayoutData | null;
};

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
        await writeArticle(ctx, actor, { kind: "replace-existing", article: document as ProposalArticleDocument, baseHash: await articleBaseHash(ctx, before) }, {
          changeId: `${auth.articleChangeId ?? "proposal"}:${target.key}`,
          summary: auth.articleSummary ?? "Applied article proposal",
          publicChangelog: false,
          restoring: auth.articleChangeId?.startsWith("revert-") === true,
        });
        return { revalidatePaths: saveRevalidationPaths([`/${target.key}`, "/substances"], []) };
      }
      const actor = await requireRole(ctx, { apiKey: auth.apiKey, actorEmail: auth.actorEmail, adminIntent: "editorArticleWrite" }, "admin");
      const result = await writeArticle(ctx, actor, { kind: "create", article: document as ProposalArticleDocument }, {
        changeId: `${auth.articleChangeId ?? "proposal"}:${target.key}`,
        summary: auth.articleSummary ?? "Created article from proposal", publicChangelog: false,
      });
      return { revalidatePaths: result.outcome.affectedPaths };
    }
    case "indexLayout": {
      const type = target.key as IndexLayoutType;
      if (document === null) {
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
        const about = document as AboutDocument;
        await saveAboutHandler(ctx, {
          apiKey: auth.apiKey,
          actorEmail: auth.actorEmail,
          aboutMarkdown: about.aboutMarkdown,
          aboutSubtitle: about.aboutSubtitle,
          founderProfileKeys: about.founderProfileKeys,
          translationCredits: about.translationCredits,
          updatedBy: auth.actorEmail,
        });
      }
      return { revalidatePaths: ABOUT_REVALIDATION_PATHS };
    }
    case "writing": {
      const existing = await ctx.db
        .query("effectIndexArticles")
        .withIndex("by_slug", (q) => q.eq("slug", target.key))
        .first();
      const kind = (document as { kind?: unknown } | null)?.kind ?? existing?.kind;
      if (document === null) {
        if (existing) {
          await requireRole(ctx, { apiKey: auth.apiKey, actorEmail: auth.actorEmail, adminIntent: "editorArticleWrite" }, "admin");
          await ctx.db.delete(existing._id);
        }
      } else if (auth.articleChangeId?.startsWith("revert-")) {
        const actor = await requireRole(ctx, { apiKey: auth.apiKey, actorEmail: auth.actorEmail, adminIntent: "editorArticleWrite" }, "admin");
        const stored = document as Omit<Doc<"effectIndexArticles">, "_id" | "_creationTime">;
        let id = existing?._id;
        if (id) await ctx.db.replace(id, stored);
        else id = await ctx.db.insert("effectIndexArticles", stored);
        await recordNarrativeMaintenance(ctx, { kind: "writing", key: target.key, actor, before: existing, after: (await ctx.db.get(id))! });
      } else {
        await upsertWritingArticleHandler(ctx, {
          intent: "publish",
          apiKey: auth.apiKey,
          actorEmail: auth.actorEmail,
          ...writingUpsertFields(document as WritingProposalDocument),
          expectedRevision: await currentNarrativeRevision(ctx, "writing", existing),
          operationId: proposalOperationId(auth.articleChangeId ?? "proposal", target.key),
        });
      }
      return { revalidatePaths: writingRevalidationPaths(target.key, kind) };
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
      return { revalidatePaths: ["/copy-blocks"] };
    }
  }
}

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
  if (payload.writing) {
    documents.push({ kind: "writing", key: payload.writing.slug, document: payload.writing });
  }
  return documents;
}

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
