import { buildArticleChangelog, collectDiff, type DiffEntry } from "../../src/utils/data/changelog";
import { truncateDiffMarkdown } from "../../lib/proposals/diffMarkdown";
import { proposalComparableDocument } from "../../lib/proposals/proposalBaseline";
import { mergeArticleReferenceMetadataForReplacement } from "./substanceIngestion";
import { payloadDocuments, type ProposalPayload, type ProposalSnapshotEntry } from "./changeProposalApply";
import type { Reference } from "../../src/schema/substance/shared";
import { validateArticleForIngestion } from "./validators";
import { normalizeCopyBlockPayload, type CopyBlockDocument } from "../copyBlocks";
import { proposalPublicDocument } from "../../lib/proposals/proposalPublic";
import { validateArticleChange, type ArticleDocument } from "./articleLifecycleValidation";

/** Mirror the actual write: changed article units for updates, ingestion for new rows. */
export function proposalWriteDocument(entry: ProposalSnapshotEntry, before: unknown): unknown {
  const proposed = entry.document as Record<string, unknown>;
  const original = (before ?? {}) as Record<string, unknown>;
  if (entry.kind === "article") {
    if (before !== null && before !== undefined) {
      return validateArticleChange(original as ArticleDocument, proposed);
    }
    const validation = validateArticleForIngestion(proposed);
    if (validation.ok === false) throw new Error(`Invalid proposed article: ${validation.message}`);
    const merged = mergeArticleReferenceMetadataForReplacement(
      { ...validation.article, id: validation.article.id ?? null, slug: entry.key },
      (original.references ?? []) as Reference[],
    ).article;
    return { ...original, ...merged };
  }
  if (entry.kind === "copyBlock") return {
    key: entry.key,
    flavor: typeof proposed.flavor === "string" ? proposed.flavor.trim() || undefined : undefined,
    kind: proposed.kind,
    ...normalizeCopyBlockPayload(proposed as CopyBlockDocument),
    label: typeof proposed.label === "string" ? proposed.label.trim() || undefined : undefined,
    group: typeof proposed.group === "string" ? proposed.group.trim() || undefined : undefined,
  };
  return proposed;
}

export function buildProposalDiff(payload: ProposalPayload, baseline: readonly ProposalSnapshotEntry[]): string {
  const markdown = payloadDocuments(payload).map((entry) => {
    const before = baseline.find((row) => row.kind === entry.kind && row.key === entry.key)?.document ?? null;
    const changes: DiffEntry[] = [];
    collectDiff(
      proposalPublicDocument(proposalComparableDocument(entry.kind, before)),
      proposalPublicDocument(proposalComparableDocument(entry.kind, proposalWriteDocument(entry, before))),
      [],
      changes,
    );
    return changes.map((change) => buildArticleChangelog(
      `${entry.kind}: ${entry.key}${change.path ? ` / ${change.path}` : ""}`,
      change.before,
      change.after,
    ).markdown).join("\n");
  }).join("\n\n");
  return truncateDiffMarkdown(markdown);
}
