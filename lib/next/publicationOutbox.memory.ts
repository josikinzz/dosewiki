/**
 * In-memory adapter for the publication outbox store. It applies the same
 * policy functions the Postgres adapters apply, so tests exercise the real
 * attempt, lease, backoff and dead-letter rules without a database.
 */
import {
  hasTranslationIntent,
  pendingPublicationRow,
  planPublicationClaim,
  settlePublicationDelivery,
  TRANSLATION_QUEUE_RECEIPT,
  publicationOutboxKey,
  type PublicationOrigin,
  type PublicationOutboxEntry,
  type PublicationOutboxRow,
  type PublicationOutboxStore,
} from "./publicationOutbox";

export function createInMemoryPublicationOutbox(options: { now?: () => number } = {}) {
  const now = options.now ?? Date.now;
  const rows: PublicationOutboxRow[] = [];
  let nextId = 1;
  const copy = (row: PublicationOutboxRow) => structuredClone(row);
  const byDue = (left: PublicationOutboxRow, right: PublicationOutboxRow) =>
    left.nextAttemptAt - right.nextAttemptAt || rows.indexOf(left) - rows.indexOf(right);

  const store: PublicationOutboxStore = {
    async claimDue() {
      const at = now();
      const due = rows.filter((row) => row.pending && row.nextAttemptAt <= at).sort(byDue);
      const plan = planPublicationClaim(due.filter((row) => row.attempts === 0), due, at);
      for (const { row, patch } of [...plan.deadLetters, ...plan.claims]) Object.assign(row, patch);
      return plan.claims.map(({ row }) => copy(row));
    },
    async recordDelivery(report) {
      const row = rows.find((candidate) => candidate._id === report.id);
      const patch = row ? settlePublicationDelivery(row, report, now()) : null;
      if (row && patch) Object.assign(row, patch);
    },
  };

  return {
    store,
    /** What a caller's transaction writes: one pending row per identity. */
    enqueue(entries: readonly PublicationOutboxEntry[], origin: PublicationOrigin) {
      for (const entry of entries) {
        const current = rows.find((row) => row.key === publicationOutboxKey(entry.target)) ?? null;
        const value = pendingPublicationRow(current, entry, now(), origin);
        if (current) Object.assign(current, value, { deadLetteredAt: undefined });
        else rows.push({ _id: `publicCachePublications:${nextId++}`, ...value });
      }
    },
    /** What `enqueueTranslationJobs` records once locale work for a generation is durable. */
    recordTranslationIntent(id: string, generation: number) {
      const row = rows.find((candidate) => candidate._id === id);
      if (!row || row.generation !== generation || !row.pending || hasTranslationIntent(row.receipts, generation)) return;
      row.receipts.push({ target: TRANSLATION_QUEUE_RECEIPT, generation, status: "accepted", attempts: 1, jobs: [] });
    },
    rows: () => rows.map(copy),
  };
}
