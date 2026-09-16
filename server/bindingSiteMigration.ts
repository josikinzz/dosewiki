import { v } from "../lib/postgres/runtime/values";

import {
  migratePharmacologyBindingSites,
  planBindingSiteMigration,
  remapBindingSiteEvidencePath,
} from "../lib/article/normalization.mjs";
import { query } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import { validateArticleForIngestion } from "./lib/validators";

const DEFAULT_ARTICLE_PAGE_SIZE = 10;
const MAX_ARTICLE_PAGE_SIZE = 25;
const DEFAULT_EVIDENCE_PAGE_SIZE = 50;
const MAX_EVIDENCE_PAGE_SIZE = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }
  if (!isRecord(value)) {
    return JSON.stringify(value) ?? "undefined";
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    .join(",")}}`;
}

function boundedLimit(value: number | undefined, fallback: number, maximum: number) {
  return Math.min(Math.max(Math.floor(value ?? fallback), 1), maximum);
}

function articleAuditItem(article: Record<string, unknown> & {
  title: string;
  slug?: string;
  pharmacology: unknown;
}) {
  const plan = planBindingSiteMigration(article.pharmacology);
  const migratedPharmacology = migratePharmacologyBindingSites(article.pharmacology);
  const validation = validateArticleForIngestion({
    ...article,
    pharmacology: migratedPharmacology,
  });
  const articleIssues = validation.ok === true
    ? stableSerialize(migratedPharmacology) ===
      stableSerialize(validation.article.pharmacology)
      ? []
      : ["canonical contract would normalize or strip pharmacology values"]
    : validation.issues;
  return {
    title: article.title,
    slug: article.slug ?? null,
    status: plan.status,
    needsMigration: plan.needsMigration,
    bindingSiteCount: plan.bindingSites.length,
    legacyKeys: plan.legacyKeys,
    conflicts: plan.conflicts,
    issues: plan.issues,
    articleIssues,
    suspiciousTargets: plan.suspiciousTargets,
  };
}

/**
 * Read-only, bounded article audit. It exposes only migration diagnostics, not
 * complete article documents, so dry runs do not need a write credential.
 */
export const auditArticlesPage = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    items: v.array(v.object({
      title: v.string(),
      slug: v.union(v.string(), v.null()),
      status: v.string(),
      needsMigration: v.boolean(),
      bindingSiteCount: v.number(),
      legacyKeys: v.array(v.string()),
      conflicts: v.array(v.string()),
      issues: v.array(v.string()),
      articleIssues: v.array(v.string()),
      suspiciousTargets: v.array(v.object({
        index: v.number(),
        target: v.string(),
        reason: v.string(),
      })),
    })),
    cursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("substanceIndex").paginate({
      cursor: args.cursor ?? null,
      numItems: boundedLimit(args.limit, DEFAULT_ARTICLE_PAGE_SIZE, MAX_ARTICLE_PAGE_SIZE),
    });

    return {
      items: page.page.map(articleAuditItem),
      cursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/**
 * Canonicalize one bounded page. Conflicting or malformed dual-field records
 * are reported and skipped; every other patch is computed from the document
 * read in this transaction and writes only the pharmacology field.
 */
export const migrateArticlesPage = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    migrated: v.number(),
    alreadyCanonical: v.number(),
    skipped: v.array(v.object({
      title: v.string(),
      slug: v.union(v.string(), v.null()),
      status: v.string(),
      reasons: v.array(v.string()),
    })),
    suspiciousTargets: v.array(v.object({
      slug: v.union(v.string(), v.null()),
      index: v.number(),
      target: v.string(),
      reason: v.string(),
    })),
    cursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "admin");

    const page = await ctx.db.query("substanceIndex").paginate({
      cursor: args.cursor ?? null,
      numItems: boundedLimit(args.limit, DEFAULT_ARTICLE_PAGE_SIZE, MAX_ARTICLE_PAGE_SIZE),
    });
    let migrated = 0;
    let alreadyCanonical = 0;
    const skipped = [];
    const suspiciousTargets = [];

    for (const article of page.page) {
      const plan = planBindingSiteMigration(article.pharmacology);
      suspiciousTargets.push(
        ...plan.suspiciousTargets.map((entry) => ({
          slug: article.slug ?? null,
          ...entry,
        })),
      );

      if (plan.status === "conflict" || plan.status === "invalid") {
        skipped.push({
          title: article.title,
          slug: article.slug ?? null,
          status: plan.status,
          reasons: [...plan.conflicts, ...plan.issues],
        });
        continue;
      }
      if (!plan.needsMigration) {
        alreadyCanonical += 1;
        continue;
      }

      const migratedPharmacology = migratePharmacologyBindingSites(article.pharmacology);
      const validation = validateArticleForIngestion({
        ...article,
        pharmacology: migratedPharmacology,
      });
      if (validation.ok === false) {
        skipped.push({
          title: article.title,
          slug: article.slug ?? null,
          status: "invalid_article",
          reasons: validation.issues,
        });
        continue;
      }

      if (
        stableSerialize(migratedPharmacology) !==
        stableSerialize(validation.article.pharmacology)
      ) {
        skipped.push({
          title: article.title,
          slug: article.slug ?? null,
          status: "normalization_required",
          reasons: ["canonical contract would normalize or strip pharmacology values"],
        });
        continue;
      }

      await ctx.db.patch(article._id, {
        pharmacology: migratedPharmacology,
      });
      migrated += 1;
    }

    return {
      migrated,
      alreadyCanonical,
      skipped,
      suspiciousTargets,
      cursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/** Citation evidence remains protected even for read-only migration audits. */
export const auditEvidencePage = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    remappable: v.array(v.object({
      slug: v.string(),
      fieldPath: v.string(),
      nextFieldPath: v.string(),
    })),
    unmappable: v.array(v.object({
      slug: v.string(),
      fieldPath: v.string(),
      reason: v.string(),
    })),
    cursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "citationEvidenceWrite",
    }, "admin");
    const page = await ctx.db.query("citationEvidence").paginate({
      cursor: args.cursor ?? null,
      numItems: boundedLimit(args.limit, DEFAULT_EVIDENCE_PAGE_SIZE, MAX_EVIDENCE_PAGE_SIZE),
    });
    const remappable = [];
    const unmappable = [];

    for (const row of page.page) {
      const result = remapBindingSiteEvidencePath({
        slug: row.slug,
        claimKey: row.claimKey,
        fieldPath: row.fieldPath,
      });
      if (result.status === "remapped") {
        remappable.push({
          slug: row.slug,
          fieldPath: row.fieldPath ?? "",
          nextFieldPath: result.path,
        });
      } else if (result.status === "unmappable") {
        unmappable.push({
          slug: row.slug,
          fieldPath: row.fieldPath ?? "",
          reason: result.reason,
        });
      }
    }

    return {
      remappable,
      unmappable,
      cursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/** Migrate only exact parsed evidence paths; unsupported legacy maps are skipped. */
export const migrateEvidencePage = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    migrated: v.number(),
    unmappable: v.array(v.object({
      slug: v.string(),
      fieldPath: v.string(),
      reason: v.string(),
    })),
    cursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "citationEvidenceWrite",
    }, "admin");
    const page = await ctx.db.query("citationEvidence").paginate({
      cursor: args.cursor ?? null,
      numItems: boundedLimit(args.limit, DEFAULT_EVIDENCE_PAGE_SIZE, MAX_EVIDENCE_PAGE_SIZE),
    });
    const now = new Date().toISOString();
    let migrated = 0;
    const unmappable = [];

    for (const row of page.page) {
      const result = remapBindingSiteEvidencePath({
        slug: row.slug,
        claimKey: row.claimKey,
        fieldPath: row.fieldPath,
      });
      if (result.status === "remapped") {
        await ctx.db.patch(row._id, {
          fieldPath: result.path,
          updatedAt: now,
          updatedBy: actor.email,
        });
        migrated += 1;
      } else if (result.status === "unmappable") {
        unmappable.push({
          slug: row.slug,
          fieldPath: row.fieldPath ?? "",
          reason: result.reason,
        });
      }
    }

    return {
      migrated,
      unmappable,
      cursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});
