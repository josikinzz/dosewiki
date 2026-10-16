import { contentHash } from "../../../../lib/proposals/contentHash";
import { articleArrayIdentity } from "../../../../lib/proposals/articlePatch";
import { mergeThreeWay, type MergeChoices, type ThreeWayMerge } from "../../../../lib/proposals/threeWayMerge";
import type { ArticleRecord } from "../context/devModeTypes";
import { resolveEditorArticleSlug } from "../context/devModeUtils";
import { isSameDocument } from "../context/editorDocumentSession";

export type StagedArticleChange = {
  slug: string;
  baseline: string;
  baseHash?: string;
  set: Record<string, unknown>;
  unset: string[];
  before?: Record<string, unknown>;
};

export type StagedArticlesDraft = { changes: StagedArticleChange[] };

export const NEW_ARTICLE_BASELINE = contentHash(null);

export function stagedArticleBaseline(article: ArticleRecord | undefined): string {
  try {
    return article ? contentHash(article) : NEW_ARTICLE_BASELINE;
  } catch {
    return "unhashable";
  }
}

export function stagedArticleChanges(
  articles: readonly ArticleRecord[],
  originals: readonly ArticleRecord[],
  baseHashes: Record<string, string> = {},
): StagedArticleChange[] {
  const changes: StagedArticleChange[] = [];
  articles.forEach((article, index) => {
    const original = originals[index];
    if (article === original || isSameDocument(article, original)) return;
    const slug = resolveEditorArticleSlug(original ?? article);
    if (!slug) return;
    const before = (original ?? {}) as Record<string, unknown>;
    const after = article as unknown as Record<string, unknown>;
    const set: Record<string, unknown> = {};
    for (const key of Object.keys(after)) {
      if (!isSameDocument(after[key], before[key])) set[key] = after[key];
    }
    const unset = Object.keys(before).filter((key) => before[key] !== undefined && after[key] === undefined);
    const previous: Record<string, unknown> = {};
    for (const key of [...Object.keys(set), ...unset]) if (before[key] !== undefined) previous[key] = before[key];
    changes.push({ slug, baseHash: baseHashes[slug], baseline: stagedArticleBaseline(original), set, unset, before: previous });
  });
  return changes;
}

export function applyStagedArticleChange(article: ArticleRecord | undefined, change: StagedArticleChange): ArticleRecord {
  const next = { ...(article ?? {}), ...change.set } as Record<string, unknown>;
  for (const key of change.unset) delete next[key];
  return next as unknown as ArticleRecord;
}

export function mergeStagedArticleChange(
  current: ArticleRecord,
  change: StagedArticleChange,
  choices: MergeChoices = {},
): ThreeWayMerge<Record<string, unknown>> | null {
  if (!change.before) return null;
  const latest = current as unknown as Record<string, unknown>;
  const base: Record<string, unknown> = {}, mine: Record<string, unknown> = {}, theirs: Record<string, unknown> = {};
  for (const key of [...Object.keys(change.set), ...change.unset]) {
    if (change.before[key] !== undefined) base[key] = change.before[key];
    if (key in change.set) mine[key] = change.set[key];
    if (latest[key] !== undefined) theirs[key] = latest[key];
  }
  return mergeThreeWay<Record<string, unknown>>(base, mine, theirs, { choices, identity: articleArrayIdentity });
}

export function applyMergedStagedArticle(current: ArticleRecord, change: StagedArticleChange, merged: Record<string, unknown>): ArticleRecord {
  const next = { ...(current as unknown as Record<string, unknown>) };
  for (const key of [...Object.keys(change.set), ...change.unset]) {
    if (merged[key] === undefined) delete next[key];
    else next[key] = merged[key];
  }
  return next as unknown as ArticleRecord;
}
