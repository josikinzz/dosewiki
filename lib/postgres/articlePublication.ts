/**
 * One substance article read, edited, published, and observed through
 * Postgres.
 *
 * The publication rules are the shared `publishReviewedSectionTransaction`
 * (section CAS, replay receipts, patch boundary). This module supplies its
 * `GeneratedPublicationDb` port over one SQL transaction and reproduces the
 * one derived write a section publish triggers: the
 * `publicCachePublications` outbox upsert (`server/lib/publicationOutbox.ts`).
 * `reviewedArticles` is deliberately not synced here because section patches
 * never touch the fields that gate it (`server/lib/indexedMutation.ts`).
 *
 * Concurrency: the article row is read `FOR UPDATE`, so two publishers of the
 * same article serialize on the row; the loser re-reads the committed content
 * and reports `conflict` instead of overwriting. Identity: the unique index on
 * `generatedPublicationOperations.proposalId` (migration 0001) makes a raced
 * replay fail at commit rather than mint a second receipt.
 */

import type { Pool, PoolClient } from "pg";
import {
  publishReviewedSectionTransaction,
  type GeneratedPublicationDb,
  type ReviewedPublicationProposal,
  type ReviewedSectionPublishResult,
} from "../../server/lib/generatedPublication";
import { projectPublicArticle, type SubstancePublicArticleProjection } from "../../src/data/projections/substanceReadProjections";
import { resolveSubstanceSlug, type SubstanceArticleRecord } from "../../src/data/projections/substanceProjectionCore";
import {
  classifySubstancePublicationDependency,
  mergeSubstancePublicationDependency,
  type SubstancePublicationDependency,
} from "../../src/data/projections/substancePublicationDependencies";
import type { DataDocument } from "./documentCodec";
import { insertDocument, patchDocument, selectDocumentById, selectDocuments, withTransaction, type SqlClient } from "./documentStore";

type ArticlePublicationTarget = {
  kind: "article";
  slug: string;
  dependency?: SubstancePublicationDependency;
};

export function articlePublicationKey(slug: string): string {
  const target: ArticlePublicationTarget = { kind: "article", slug };
  return JSON.stringify(target);
}


/** Read the stored article documents for one slug (0, 1, or more rows). */
async function readArticlesBySlug(client: SqlClient, slug: string, forUpdate = false): Promise<DataDocument[]> {
  return selectDocuments(client, "substanceIndex", {
    where: '"slug" = $1',
    params: [slug],
    orderBy: '"_creationTime" ASC',
    limit: 2,
    forUpdate,
  });
}

/** The public projection a substance page renders, or null when the slug is not exactly one article. */
export async function readPublicArticleBySlug(client: SqlClient, slug: string): Promise<SubstancePublicArticleProjection | null> {
  const articles = await readArticlesBySlug(client, slug);
  return articles.length === 1 ? projectPublicArticle(articles[0] as SubstanceArticleRecord) : null;
}

export type ArticlePublicationState = {
  publicRevision: string | null;
  outbox: DataDocument | null;
  operations: DataDocument[];
};

/** What an observer sees after a publish: the live revision, the outbox receipt, and the operation ledger. */
export async function readArticlePublicationState(client: SqlClient, slug: string): Promise<ArticlePublicationState> {
  const article = await readPublicArticleBySlug(client, slug);
  const [outbox] = await selectDocuments(client, "publicCachePublications", { where: '"key" = $1', params: [articlePublicationKey(slug)], limit: 1 });
  const operations = await selectDocuments(client, "generatedPublicationOperations", {
    where: '"slug" = $1',
    params: [slug],
    orderBy: '"createdAt" ASC, "_creationTime" ASC',
  });
  return { publicRevision: article?.publicRevision ?? null, outbox: outbox ?? null, operations };
}

function publicationDb(client: PoolClient): GeneratedPublicationDb {
  const query = ((table: "generatedPublicationOperations" | "substanceIndex") => ({
    withIndex: (_index: string, predicate: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
      let field = "";
      let value: unknown;
      predicate({ eq: (f, v) => { field = f; value = v; return undefined; } });
      if (table === "generatedPublicationOperations") {
        if (field !== "proposalId") throw new Error(`Unsupported operations lookup on ${field}`);
        return {
          unique: async () => {
            const [row] = await selectDocuments(client, table, { where: '"proposalId" = $1', params: [value], limit: 2 });
            return row ? { payloadDigest: row.payloadDigest as string, nextHash: row.nextHash as string } : null;
          },
        };
      }
      if (field !== "slug") throw new Error(`Unsupported article lookup on ${field}`);
      return {
        take: async (limit: number) => {
          const rows = await readArticlesBySlug(client, value as string, true);
          return rows.slice(0, limit) as Array<Record<string, unknown> & { _id: unknown }>;
        },
      };
    },
  })) as GeneratedPublicationDb["query"];
  return {
    query,
    patch: async (id, patch) => {
      const patched = await patchDocument(client, "substanceIndex", id as string, patch);
      if (!patched) throw new Error(`substanceIndex ${String(id)} vanished inside the publish transaction`);
    },
    insert: async (table, value) => insertDocument(client, table, value),
  };
}

/**
 * Mirror of `withPublicationOutbox.commit` for a single substanceIndex row:
 * when the public revision changed, upsert one pending outbox receipt keyed by
 * the article target, bumping `generation` so a stale delivery is ignored.
 */
async function upsertArticleOutbox(client: SqlClient, before: DataDocument | null, after: DataDocument | null, now: number): Promise<boolean> {
  const revisionOf = (row: DataDocument | null) => (row ? projectPublicArticle(row as SubstanceArticleRecord).publicRevision : null);
  const afterRevision = revisionOf(after);
  if (revisionOf(before) === afterRevision) return false;
  const dependency = classifySubstancePublicationDependency(
    before as SubstanceArticleRecord | null,
    after as SubstanceArticleRecord | null,
  );
  const slugs = new Set<string>();
  for (const row of [before, after]) {
    const slug = row ? resolveSubstanceSlug(row as SubstanceArticleRecord) : null;
    if (typeof slug === "string" && slug) slugs.add(slug);
  }
  const afterSlug = after ? resolveSubstanceSlug(after as SubstanceArticleRecord) : null;
  for (const slug of slugs) {
    const key = articlePublicationKey(slug);
    const [current] = await selectDocuments(client, "publicCachePublications", { where: '"key" = $1', params: [key], limit: 1, forUpdate: true });
    // The target that still has an article carries its revision; a vacated slug carries null.
    const revision = slug === afterSlug ? afterRevision : null;
    const pendingDependency = current?.pending === true &&
      (current.target as ArticlePublicationTarget | undefined)?.kind === "article"
      ? mergeSubstancePublicationDependency(
          (current.target as ArticlePublicationTarget).dependency,
          dependency,
        )
      : dependency;
    const value = {
      key,
      target: { kind: "article", slug, dependency: pendingDependency },
      revision,
      generation: ((current?.generation as number | undefined) ?? 0) + 1,
      pending: true,
      nextAttemptAt: now,
      attempts: 0,
      receipts: [],
      committedAt: now,
    };
    if (current) await patchDocument(client, "publicCachePublications", current._id as string, value);
    else await insertDocument(client, "publicCachePublications", value);
  }
  return true;
}

export type PublishReviewedSectionInput = {
  pool: Pool;
  proposal: ReviewedPublicationProposal;
  actorEmail: string;
  now?: Date;
  expectedTargetDeploymentFingerprint: string;
  /**
   * Runs inside the transaction after every write and before COMMIT. Exists
   * for rehearsals that inject a failure or hold the row lock; production
   * callers leave it unset.
   */
  beforeCommit?: (client: PoolClient) => Promise<void>;
};

export type PublishReviewedSectionResult = ReviewedSectionPublishResult & { outboxWritten: boolean };

/** Publish one reviewed section through Postgres: content, receipt, and outbox commit together or not at all. */
export async function publishReviewedSectionInPostgres(input: PublishReviewedSectionInput): Promise<PublishReviewedSectionResult> {
  const now = input.now ?? new Date();
  return withTransaction(input.pool, async (client) => {
    const [before] = await readArticlesBySlug(client, input.proposal.slug, true);
    const result = await publishReviewedSectionTransaction({
      db: publicationDb(client),
      proposal: input.proposal,
      actorEmail: input.actorEmail,
      now: now.toISOString(),
      expectedTargetDeploymentFingerprint: input.expectedTargetDeploymentFingerprint,
    });
    let outboxWritten = false;
    if (result.status === "updated" && before) {
      const after = await selectDocumentById(client, "substanceIndex", before._id as string);
      outboxWritten = await upsertArticleOutbox(client, before, after, now.getTime());
    }
    await input.beforeCommit?.(client);
    return { ...result, outboxWritten };
  });
}
