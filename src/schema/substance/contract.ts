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

export function parseSubstanceArticleContract(value: unknown): SubstanceArticleStorage {
  return substanceArticleStorageSchema.parse(value);
}

export function formatSubstanceArticleContractIssues(
  issues: readonly SubstanceArticleContractIssue[],
): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}

export function isSubstanceArticle(value: unknown): value is SubstanceArticle {
  return validateSubstanceArticleContract(value).ok;
}
