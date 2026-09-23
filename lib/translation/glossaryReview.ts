/** Human drafts are separate from the effective glossary until explicitly approved. */
import "server-only";
import { getPostgresClient } from "@server/postgres/runtime/backend";
import { assertDataWritesNotFrozen } from "../runtime/dataWriteFreeze";
import {
  assertNoCollisions,
  readGlossaryRows,
  type GlossaryDraft,
  type TranslationGlossaryRow,
} from "./glossary";
import {
  mutateReviewEntryInTransaction,
  readReviewEntries,
  readReviewHistory,
  TranslationReviewConflictError,
} from "./reviewStore";
import type { ReviewTransaction } from "./reviewStore";
import type {
  ReviewEntry,
  ReviewMutation,
  ReviewSnapshot,
} from "./reviewTypes";

export type GlossaryReviewRow = TranslationGlossaryRow & {
  revision: string;
  approved_target: string | null;
  review_provenance: "human_review" | "legacy_unverified" | "unreviewed";
};
const snapshot = (row: GlossaryDraft): ReviewSnapshot => ({
  source: row.term,
  target: row.target,
  context: row.kind,
});
export function glossaryRevision(
  base: Pick<TranslationGlossaryRow, "updated_at">,
  review?: ReviewEntry,
): string {
  return `${base.updated_at}:${review?.revision ?? 0}`;
}
export function projectGlossaryReviewRows(
  rows: TranslationGlossaryRow[],
  entries: ReviewEntry[],
  humanApprovals: ReadonlySet<string> = new Set(),
): GlossaryReviewRow[] {
  const reviews = new Map(entries.map((entry) => [entry.sourceId, entry]));
  return rows.map((row) => {
    const review = reviews.get(row.term);
    return {
      ...row,
      target: review?.draft?.target ?? row.target,
      kind: review?.draft?.context ?? row.kind,
      status: review?.draft ? "draft" : row.status,
      source: review ? "human" : row.source,
      revision: glossaryRevision(row, review),
      approved_target: row.status === "approved" ? row.target : null,
      // Legacy metadata is not proof that a human explicitly reviewed these exact bytes.
      review_provenance:
        humanApprovals.has(row.term) &&
        review?.approved &&
        review.approved.target === row.target &&
        row.status === "approved"
          ? "human_review"
          : row.status === "approved"
            ? "legacy_unverified"
            : "unreviewed",
    };
  });
}
export async function readGlossaryReviewRows(
  locale: string,
  baseRows?: TranslationGlossaryRow[],
): Promise<GlossaryReviewRow[]> {
  const [rows, entries] = await Promise.all([
    baseRows ?? readGlossaryRows(locale),
    readReviewEntries(locale, "glossary"),
  ]);
  const approvals = await getPostgresClient().sql<{
    source_id: string;
    target: string;
    actor: string;
  }>(
    `SELECT DISTINCT ON ("source_id") "source_id", "after_state"->'approved'->>'target' AS "target", "actor" FROM "translationReviewHistory" WHERE "locale" = $1 AND "scope" = 'glossary' AND "action" = 'approve' ORDER BY "source_id", "revision" DESC`,
    [locale],
  );
  const approved = new Set(
    approvals
      .filter((a) =>
        rows.some(
          (r) =>
            r.term === a.source_id &&
            r.target === a.target &&
            r.reviewed_by === a.actor,
        ),
      )
      .map((a) => a.source_id),
  );
  return projectGlossaryReviewRows(rows, entries, approved);
}
export { readReviewHistory as readGlossaryReviewHistory };

type GlossaryMutation = {
  term: string;
  expectedRevision: string;
  action: "save" | "approve" | "restore";
  target?: string;
  restoreRevision?: number;
  kind?: string;
};
export async function mutateGlossaryReview(
  locale: string,
  changes: GlossaryMutation[],
  actor: string,
  collisionConfirmation?: string,
  reason = "Glossary review",
): Promise<GlossaryReviewRow[]> {
  assertDataWritesNotFrozen("mutateGlossaryReview");
  const [baseRows, entries] = await Promise.all([
    readGlossaryRows(locale),
    readReviewEntries(locale, "glossary"),
  ]);
  const base = new Map(baseRows.map((row) => [row.term, row]));
  const reviews = new Map(entries.map((row) => [row.sourceId, row]));
  const candidates: GlossaryDraft[] = [];
  for (const change of changes) {
    const row = base.get(change.term);
    if (
      !row ||
      glossaryRevision(row, reviews.get(change.term)) !==
        change.expectedRevision
    )
      throw new TranslationReviewConflictError();
    if (change.action === "approve")
      candidates.push({
        term: row.term,
        target: reviews.get(row.term)?.draft?.target ?? row.target,
        kind: reviews.get(row.term)?.draft?.context ?? row.kind,
      });
  }
  if (candidates.length)
    await assertNoCollisions(locale, candidates, collisionConfirmation);
  const inputs: ReviewMutation[] = changes.map((change) => {
    const row = base.get(change.term)!;
    return {
      locale,
      scope: "glossary",
      sourceId: row.term,
      source: row.term,
      context: change.kind ?? reviews.get(row.term)?.draft?.context ?? row.kind,
      expectedRevision: reviews.get(row.term)?.revision ?? 0,
      action: change.action,
      target: change.target,
      restoreRevision: change.restoreRevision,
      actor,
      reason,
    };
  });
  const options = changes.map((change) => {
    const row = base.get(change.term)!;
    return {
      ...(row.status === "approved"
        ? {
            seedApproved: snapshot(row),
            ...(change.action === "approve"
              ? { seedDraft: snapshot(row) }
              : {}),
          }
        : { seedDraft: snapshot(row) }),
      beforeTransition: async (tx: ReviewTransaction) => {
        const result = await tx.query(
          'SELECT "updated_at" FROM "translationGlossary" WHERE "locale" = $1 AND "term" = $2 FOR UPDATE',
          [locale, row.term],
        );
        if (
          !result.rows[0] ||
          Number(result.rows[0].updated_at) !== row.updated_at
        )
          throw new TranslationReviewConflictError();
      },
      onApprove: async (tx: ReviewTransaction, approved: ReviewSnapshot) => {
        const now = Math.max(Date.now(), row.updated_at + 1);
        await tx.query(
          `UPDATE "translationGlossary" SET "target" = $3, "kind" = $4, "status" = 'approved', "source" = 'human', "reviewed_at" = $5, "reviewed_by" = $6, "updated_at" = $5 WHERE "locale" = $1 AND "term" = $2`,
          [locale, row.term, approved.target, approved.context, now, actor],
        );
      },
    };
  });
  await getPostgresClient().sqlTransaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `translation-glossary:${locale}`,
    ]);
    if (candidates.length)
      await assertNoCollisions(locale, candidates, collisionConfirmation, tx);
    for (const i of inputs
      .map((_, i) => i)
      .sort((a, b) => inputs[a].sourceId.localeCompare(inputs[b].sourceId)))
      await mutateReviewEntryInTransaction(tx, inputs[i], options[i]);
  });
  return readGlossaryReviewRows(locale);
}

/** CSV status is advisory input only. Every changed rendering enters human review. */
export async function importGlossaryDrafts(
  locale: string,
  rows: GlossaryDraft[],
  actor: string,
): Promise<number> {
  assertDataWritesNotFrozen("importGlossaryDrafts");
  const [baseRows, reviews] = await Promise.all([
    readGlossaryRows(locale),
    readReviewEntries(locale, "glossary"),
  ]);
  const base = new Map(baseRows.map((row) => [row.term, row]));
  const byReview = new Map(reviews.map((row) => [row.sourceId, row]));
  const now = Date.now();
  await getPostgresClient().sqlTransaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `translation-glossary:${locale}`,
    ]);
    for (const proposed of [...rows].sort((a, b) =>
      a.term.localeCompare(b.term),
    )) {
      const current = base.get(proposed.term);
      if (!current)
        await tx.query(
          `INSERT INTO "translationGlossary" ("locale", "term", "target", "kind", "status", "source", "updated_at") VALUES ($1,$2,$3,$4,'draft','human',$5) ON CONFLICT DO NOTHING`,
          [locale, proposed.term, proposed.target, proposed.kind, now],
        );
      await mutateReviewEntryInTransaction(
        tx,
        {
          locale,
          scope: "glossary",
          sourceId: proposed.term,
          source: proposed.term,
          context: proposed.kind,
          target: proposed.target,
          expectedRevision: byReview.get(proposed.term)?.revision ?? 0,
          action: "save",
          actor,
          reason: "CSV import; approval status was not imported",
        },
        {
          ...(current?.status === "approved"
            ? { seedApproved: snapshot(current) }
            : { seedDraft: snapshot(current ?? proposed) }),
          beforeTransition: async (locked) => {
            const found = await locked.query(
              'SELECT "updated_at", "target", "source" FROM "translationGlossary" WHERE "locale"=$1 AND "term"=$2 FOR UPDATE',
              [locale, proposed.term],
            );
            const actual = found.rows[0];
            if (
              !actual ||
              Number(actual.updated_at) !== (current?.updated_at ?? now) ||
              (!current &&
                (actual.target !== proposed.target ||
                  actual.source !== "human"))
            )
              throw new TranslationReviewConflictError();
          },
        },
      );
    }
  });
  return rows.length;
}
