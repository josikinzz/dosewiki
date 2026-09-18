import chemicalIndexManual from "@data/substances/chemicalIndexManual.json";
import { buildChemicalClassTree } from "../src/data/builders/chemicalClassTree";
import { resolveChemicalClassKey } from "../src/data/indexes/chemicalClassLookup";
import { projectLookup } from "../src/data/projections/substanceReadProjections";
import { resolveSubstanceSlug, type SubstanceArticleRecord } from "../src/data/projections/substanceProjectionCore";
import {
  isDirectUrlOnlySubstance,
  isHiddenSubstance,
} from "../src/schema/substance/substanceVisibilityPolicy";
import { paginationOptsValidator, query, type QueryCtx } from "../lib/postgres/runtime/server";
import type { Doc } from "../lib/postgres/runtime/dataModel";
import { v } from "../lib/postgres/runtime/values";
import { requireRole } from "./lib/auth";

const MAX_PAGE_SIZE = 200;

type MoleculeDatabase = QueryCtx["db"] & {
  getMoleculePickerPage(options: { numItems: number; cursor: string | null }): Promise<{
    page: Array<{ article: Doc<"substanceIndex">; hasOverride: boolean }>;
    continueCursor: string;
    isDone: boolean;
  }>;
  getMoleculeSourceBySlug(slug: string): Promise<Doc<"substanceIndex"> | null>;
  getMoleculeEditSourceBySlug(slug: string): Promise<Doc<"moleculeOverrides"> | null>;
};

type ManualClass = { key: string; label: string; parents?: string[] };
const CLASS_TREE = buildChemicalClassTree(chemicalIndexManual.classes as ManualClass[]);

function pageSize(requested: number): number {
  return Math.min(Math.max(Math.floor(requested), 1), MAX_PAGE_SIZE);
}

async function authorize(ctx: QueryCtx, args: { apiKey?: string; actorEmail?: string }) {
  await requireRole(
    ctx,
    { ...args, adminIntent: "editorArticleWrite" },
    "admin",
  );
}

function projectPickerRow(article: Doc<"substanceIndex">, hasOverride: boolean) {
  const lookup = projectLookup(article as SubstanceArticleRecord);
  return {
    slug: lookup.slug,
    title: lookup.name,
    priority: article.priority,
    index_categories: article.index_categories,
    classification: article.classification,
    hasOverride,
  };
}

function chemicalClasses(classification: unknown): string[] {
  if (!classification || typeof classification !== "object") return [];
  const raw = (classification as { chemical_class?: unknown }).chemical_class;
  return Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === "string")
    : [];
}

function isClassMember(eligible: ReadonlySet<string>, article: Doc<"substanceIndex">): boolean {
  if (
    isHiddenSubstance(article.index_categories as string[] | null | undefined) ||
    isDirectUrlOnlySubstance(article.priority as string | null | undefined)
  ) {
    return false;
  }
  const matched = new Set(
    chemicalClasses(article.classification)
      .map(resolveChemicalClassKey)
      .filter((key): key is string => key !== null),
  );
  const mostSpecific = Array.from(matched).filter(
    (key) => !CLASS_TREE.descendantsOf(key).some((descendant) => matched.has(descendant)),
  );
  return mostSpecific.some((key) => eligible.has(key));
}

const protectedArgs = {
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
};

const pickerRow = v.object({
  slug: v.string(),
  title: v.string(),
  priority: v.optional(v.any()),
  index_categories: v.optional(v.any()),
  classification: v.optional(v.any()),
  hasOverride: v.boolean(),
});

const pickerPage = v.object({
  page: v.array(pickerRow),
  continueCursor: v.string(),
  isDone: v.boolean(),
});

export const listPickerPage = query({
  args: { ...protectedArgs, paginationOpts: paginationOptsValidator },
  returns: pickerPage,
  handler: async (ctx, args) => {
    await authorize(ctx, args);
    const result = await (ctx.db as MoleculeDatabase).getMoleculePickerPage({
      cursor: args.paginationOpts.cursor,
      numItems: pageSize(args.paginationOpts.numItems),
    });
    return {
      ...result,
      page: result.page.map(({ article, hasOverride }) => projectPickerRow(article, hasOverride)),
    };
  },
});

export const getSource = query({
  args: { ...protectedArgs, slug: v.string() },
  returns: v.union(
    v.object({ slug: v.string(), smiles: v.string() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await authorize(ctx, args);
    const article = await (ctx.db as MoleculeDatabase).getMoleculeSourceBySlug(args.slug);
    if (!article) return null;
    const rawSmiles = (article.identification as { smiles?: unknown } | undefined)?.smiles;
    return {
      slug: resolveSubstanceSlug(article as SubstanceArticleRecord),
      smiles: typeof rawSmiles === "string" ? rawSmiles.trim() : "",
    };
  },
});

export const getEditSource = query({
  args: { ...protectedArgs, slug: v.string() },
  returns: v.union(
    v.object({
      slug: v.string(),
      molblock: v.string(),
      boldBonds: v.optional(v.array(v.number())),
      source: v.string(),
      updatedAt: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await authorize(ctx, args);
    const override = await (ctx.db as MoleculeDatabase).getMoleculeEditSourceBySlug(args.slug);
    if (!override) return null;
    return {
      slug: override.slug,
      molblock: override.molblock,
      boldBonds: override.boldBonds,
      source: override.source,
      updatedAt: override.updatedAt,
    };
  },
});

export const listClassMembers = query({
  args: {
    ...protectedArgs,
    classKey: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: pickerPage,
  handler: async (ctx, args) => {
    await authorize(ctx, args);
    const eligible = new Set([args.classKey, ...CLASS_TREE.descendantsOf(args.classKey)]);
    const result = await (ctx.db as MoleculeDatabase).getMoleculePickerPage({
      cursor: args.paginationOpts.cursor,
      numItems: pageSize(args.paginationOpts.numItems),
    });
    return {
      ...result,
      page: result.page
        .filter(({ article }) => isClassMember(eligible, article))
        .map(({ article, hasOverride }) => projectPickerRow(article, hasOverride)),
    };
  },
});
