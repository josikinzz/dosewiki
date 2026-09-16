/**
 * The substance article contract and its validation tiers.
 *
 * One Zod schema (`substanceArticleStorageSchema`) is the single source of
 * truth for what a substance article looks like. It is enforced at three
 * tiers:
 *
 * 1. Strict contract (this module) — `validateSubstanceArticleContract`. Every
 *    substance-writing Postgres mutation runs this (via
 *    `server/lib/validators.ts#validateArticleForIngestion`)
 *    before any insert/patch, so nothing structurally invalid is persisted.
 * 2. Light arg validator (`server/lib/validators.ts#substanceArticleLightValidator`)
 *    — the Postgres function-boundary layer. It only pins identity fields
 *    (id/title/slug/priority/index_categories) and stays permissive about
 *    nested section content; it is intentionally weaker than the contract.
 * 3. Frontend safeParse — read paths and builders use
 *    `validateSubstanceArticleContract` (a non-throwing `safeParse`) to guard
 *    rendering against legacy or partially-migrated stored data.
 */
import { z } from "zod";

import { substanceArticleSchema, type SubstanceArticle } from "./article";

export const substanceArticleStorageSchema = substanceArticleSchema.extend({
  slug: z.string().optional(),
});

export type SubstanceArticleStorage = z.infer<typeof substanceArticleStorageSchema>;

export type SubstanceArticleContractIssue = {
  path: string;
  message: string;
  code: string;
};

export type SubstanceArticleContractResult =
  | {
      ok: true;
      article: SubstanceArticleStorage;
      issues: [];
    }
  | {
      ok: false;
      article?: never;
      issues: SubstanceArticleContractIssue[];
    };

function formatIssuePath(path: PropertyKey[]): string {
  return path.length > 0 ? path.map(String).join(".") : "<root>";
}

export function validateSubstanceArticleContract(
  value: unknown,
): SubstanceArticleContractResult {
  const result = substanceArticleStorageSchema.safeParse(value);

  if (result.success) {
    return {
      ok: true,
      article: result.data,
      issues: [],
    };
  }

  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: formatIssuePath(issue.path),
      message: issue.message,
      code: issue.code,
    })),
  };
}


export function formatSubstanceArticleContractIssues(
  issues: readonly SubstanceArticleContractIssue[],
): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}

export function isSubstanceArticle(value: unknown): value is SubstanceArticle {
  return validateSubstanceArticleContract(value).ok;
}
