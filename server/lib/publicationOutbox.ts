import type { Id } from "../../lib/postgres/runtime/dataModel"
import type { MutationCtx } from "../../lib/postgres/runtime/server"
import { contentHash } from "../../lib/proposals/contentHash";
import { isPublicationTarget, type PublicationTarget } from "../../lib/next/publicationWire";
import { projectPublicArticle } from "../../src/data/projections/substanceReadProjections";
import { resolveSubstanceSlug, type SubstanceArticleRecord } from "../../src/data/projections/substanceProjectionCore";
import {
  classifySubstancePublicationDependency,
  mergeSubstancePublicationDependency,
  type SubstancePublicationDependency,
} from "../../src/data/projections/substancePublicationDependencies";

// Public source tables only. Drafts, proposals, intake, accounts, evidence,
// archives other than public blog posts, playlists and unpublished molecule templates are absent.
const tables = ["substanceIndex", "subjectiveEffects", "effectIndexArticles", "effectIndexArchive", "tripReports", "replications", "substanceGalleries", "contributorProfiles", "replicationArtistTaxonomy", "replicationIdentityAttributions", "replicationIdentityProfileBindings", "replicationSocialAssets", "replicationSourceAttribution", "replicationDateResearch", "reagentTests", "moleculeOverrides", "changelog", "copyBlocks", "siteConfig", "categoryLayout", "indexLayouts", "warningBannerPresets"] as const;
type Table = typeof tables[number];
type Row = Record<string, unknown>;



function publicationIdentity(target: PublicationTarget): string {
  return JSON.stringify(target.kind === "article"
    ? { kind: target.kind, slug: target.slug }
    : target);
}

function targetsFor(
  table: Table,
  row: Row | null,
  dependency: SubstancePublicationDependency = "membership",
): PublicationTarget[] {
  if (!row) return [];
  const keyed = (kind: PublicationTarget["kind"], slug: unknown): PublicationTarget[] => {
    const target = kind === "article" ? { kind, slug, dependency } : { kind, slug };
    return isPublicationTarget(target) ? [target] : [];
  };
  switch (table) {
    case "substanceIndex": return [
      ...keyed("article", resolveSubstanceSlug(row as SubstanceArticleRecord)),
      ...(dependency === "membership" ? [
        { kind: "substance-lists" } as const,
        { kind: "chemical-lists" } as const,
        { kind: "mechanism-lists" } as const,
        { kind: "chemical-class-lists" } as const,
      ] : []),
    ];
    case "subjectiveEffects": return [...keyed("effect", row.slug), { kind: "effect-lists" }];
    case "effectIndexArticles": return row.status === "draft" ? [] : row.kind === "blog"
      ? keyed("blog-post", row.slug)
      : [...keyed("library", row.slug), { kind: "writing-articles" }];
    case "effectIndexArchive": return row.kind === "post" ? keyed("blog-post", row.key) : [];
    case "tripReports": return [...keyed("report", row.slug), { kind: "report-lists" }];
    case "replications": return [...keyed("replication", row.slug), { kind: "replication-collections" }, { kind: "featured-replications" }];
    case "contributorProfiles": return [...keyed("contributor", row.key), { kind: "contributor-lists" }, { kind: "replication-collections" }, { kind: "report-lists" }];
    case "substanceGalleries": return [...keyed("article", row.substance_slug), { kind: "replication-collections" }];
    case "moleculeOverrides": return keyed("molecule", row.slug);
    case "reagentTests": return keyed("article", row.slug);
    case "changelog": return [{ kind: "changelog" }, ...(Array.isArray(row.articles)
      ? row.articles.flatMap((article: { slug?: unknown }) => keyed("article", article.slug)) : [])];
    case "copyBlocks": return [{ kind: "copy" }];
    case "warningBannerPresets": return [{ kind: "banners" }];
    case "siteConfig": return row.key === "about"
      ? [{ kind: "about" }]
      : row.key === "effect-index-featured-replications"
        ? [{ kind: "featured-replications" }]
        : row.key === "safety-banner-display"
          ? [{ kind: "banners" }]
          : [];
    case "categoryLayout": return [{ kind: "substance-lists" }];
    case "indexLayouts": return [{ kind: row.type === "chemical" ? "chemical-lists" : row.type === "mechanism" ? "mechanism-lists" : "substance-lists" }];
    default: return [{ kind: "replication-collections" }, { kind: "featured-replications" }];
  }
}

function snapshot(table: Table, row: Row | null): string | null {
  if (!row || (table === "effectIndexArticles" && row.status === "draft")) return null;
  if (table === "effectIndexArchive" && row.kind !== "post") return null;
  if (table === "substanceIndex") return projectPublicArticle(row as SubstanceArticleRecord).publicRevision;
  const { _id, _creationTime, ...content } = row;
  return contentHash(content);
}

/** Capture original and final state in the writer transaction. A crash after the
 * Postgres commit cannot lose this notification; cron reads only indexed due rows.
 * Coalescing leaves one durable receipt per identity, not a growing event log. */
export function withPublicationOutbox(ctx: MutationCtx) {
  const changes = new Map<string, { table: Table; id: Id<Table>; before: Row | null }>();
  let failure: { error: unknown } | undefined;
  const db = new Proxy(ctx.db, {
    get(writer, property, receiver) {
      const method = Reflect.get(writer, property, receiver);
      if (!["insert", "patch", "replace", "delete"].includes(String(property))) return typeof method === "function" ? method.bind(writer) : method;
      return async (...args: unknown[]) => {
        const inserted = property === "insert";
        const explicitTable = inserted || args.length === (property === "delete" ? 2 : 3);
        const id = inserted ? null : args[explicitTable ? 1 : 0] as string;
        const table = tables.find((table) => explicitTable ? args[0] === table : writer.normalizeId(table, id!) !== null);
        if (!table) return Reflect.apply(method, writer, args);
        try {
          const sourceId = id === null ? null : writer.normalizeId(table, id);
          const before = sourceId && !changes.has(sourceId) ? await writer.get(sourceId) : null;
          const result = await Reflect.apply(method, writer, args);
          const resultId = sourceId ?? result as Id<Table>;
          if (!changes.has(resultId)) changes.set(resultId, { table, id: resultId, before });
          return result;
        } catch (error) {
          failure = { error };
          throw error;
        }
      };
    },
  });
  return {
    ctx: { ...ctx, db },
    async commit() {
      if (failure) throw failure.error;
      const targets = new Map<string, { target: PublicationTarget; revision?: string | null }>();
      for (const { table, id, before } of changes.values()) {
        const after = await ctx.db.get(id);
        const afterRevision = snapshot(table, after);
        if (snapshot(table, before) === afterRevision) continue;
        const dependency = table === "substanceIndex"
          ? classifySubstancePublicationDependency(
              before as SubstanceArticleRecord | null,
              after as SubstanceArticleRecord | null,
            )
          : "membership";
        const afterTargets = targetsFor(table, after, dependency);
        const beforeTargets = targetsFor(table, before, dependency);
        for (const target of beforeTargets) {
          const key = publicationIdentity(target);
          if (!afterTargets.some((candidate) => publicationIdentity(candidate) === key)) {
            targets.set(key, { target, revision: null });
          }
        }
        for (const target of afterTargets) {
          const key = publicationIdentity(target);
          const current = targets.get(key);
          const preferredTarget = current?.target.kind === "article" && target.kind === "article"
            ? {
                ...target,
                dependency: mergeSubstancePublicationDependency(
                  current.target.dependency,
                  table === "substanceIndex" ? target.dependency : "detail",
                ),
              }
            : target;
          targets.set(key, {
            target: preferredTarget,
            revision: table === "substanceIndex" ? afterRevision : current?.revision,
          });
        }
      }
      for (const [key, pending] of targets) {
        const current = await ctx.db.query("publicCachePublications").withIndex("by_key", (q) => q.eq("key", key)).unique();
        const target = pending.target.kind === "article" &&
          current?.pending === true &&
          current.target?.kind === "article"
          ? {
              ...pending.target,
              dependency: mergeSubstancePublicationDependency(
                current.target.dependency as SubstancePublicationDependency | undefined,
                pending.target.dependency,
              ),
            }
          : pending.target;
        const knownRevision = pending.revision;
        // Dependency-only commits must not discard an article's unverified
        // revision. Resolve the latest committed source within this transaction.
        const article = target.kind === "article" && !knownRevision ? await ctx.db.query("substanceIndex")
          .withIndex("by_slug", (q) => q.eq("slug", target.slug)).first() : null;
        const revision = knownRevision ?? (article ? projectPublicArticle(article).publicRevision : target.kind === "article" ? null : undefined);
        const value = { key, target, revision, generation: (current?.generation ?? 0) + 1, pending: true, nextAttemptAt: Date.now(), attempts: 0, receipts: [], committedAt: Date.now() };
        if (current) await ctx.db.patch(current._id, value);
        else await ctx.db.insert("publicCachePublications", value);
      }
    },
  };
}
