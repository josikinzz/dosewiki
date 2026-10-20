import type { Pool, PoolClient } from "pg";
import {
  publishReviewedSectionTransaction,
  type GeneratedPublicationDb,
  type ReviewedPublicationProposal,
  type ReviewedSectionPublishResult,
} from "../../../server/lib/generatedPublication";
import { projectPublicArticle, type SubstancePublicArticleProjection } from "../../../src/data/projections/substanceReadProjections";
import { resolveSubstanceSlug, type SubstanceArticleRecord } from "../../../src/data/projections/substanceProjectionCore";
import { classifySubstancePublicationDependency } from "../../../src/data/projections/substancePublicationDependencies";
import { publicationOutboxKey } from "../../../lib/next/publicationOutbox";
import type { DataDocument } from "../../../lib/postgres/documentCodec";
import { insertDocument, patchDocument, selectDocumentById, selectDocuments, withTransaction, type SqlClient } from "../../../lib/postgres/documentStore";
import { enqueuePublications } from "../../../lib/postgres/publicationOutboxStore";

export function articlePublicationKey(slug: string): string {
  return publicationOutboxKey({ kind: "article", slug });
}

async function readArticlesBySlug(client: SqlClient, slug: string, forUpdate = false): Promise<DataDocument[]> {
  return selectDocuments(client, "substanceIndex", {
    where: '"slug" = $1',
    params: [slug],
    orderBy: '"_creationTime" ASC',
    limit: 2,
    forUpdate,
  });
}

export async function readPublicArticleBySlug(client: SqlClient, slug: string): Promise<SubstancePublicArticleProjection | null> {
  const articles = await readArticlesBySlug(client, slug);
  return articles.length === 1 ? projectPublicArticle(articles[0] as SubstanceArticleRecord) : null;
}

export type ArticlePublicationState = {
  publicRevision: string | null;
  outbox: DataDocument | null;
  operations: DataDocument[];
};

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
  await enqueuePublications(client, [...slugs].map((slug) => ({
    target: { kind: "article" as const, slug, dependency },
    revision: slug === afterSlug ? afterRevision : null,
  })), { now, origin: "editorial" });
  return true;
}

export type PublishReviewedSectionInput = {
  pool: Pool;
  proposal: ReviewedPublicationProposal;
  actorEmail: string;
  now?: Date;
  expectedTargetDeploymentFingerprint: string;
  beforeCommit?: (client: PoolClient) => Promise<void>;
};

export type PublishReviewedSectionResult = ReviewedSectionPublishResult & { outboxWritten: boolean };

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
