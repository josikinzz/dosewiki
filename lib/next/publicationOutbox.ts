import {
  mergeSubstancePublicationDependency,
  type SubstancePublicationDependency,
} from "../../src/data/projections/substancePublicationDependencies";
import type { PublicationReceipt } from "./publicationDispatch";
import { isPublicationTarget, type PublicationTarget } from "./publicationWire";

export const PUBLICATION_OUTBOX_MAX_ATTEMPTS = 10;
export const PUBLICATION_OUTBOX_LEASE_MS = 120_000;
export const PUBLICATION_OUTBOX_CLAIM_LIMIT = 18;
const DELIVERY_CONCURRENCY = 6;
export const TRANSLATION_QUEUE_RECEIPT = "translation-queue";

export type PublicationOrigin = "editorial" | "translation";

export type PublicationOutboxEntry = {
  target: PublicationTarget;
  revision?: string | null;
};

type OutboxReceipt = { target?: string; generation?: number } & Record<string, unknown>;

export type PublicationOutboxRow = {
  _id: string;
  key: string;
  target: PublicationTarget;
  revision?: string | null;
  generation: number;
  pending: boolean;
  nextAttemptAt: number;
  attempts: number;
  receipts: OutboxReceipt[];
  committedAt: number;
  deadLetteredAt?: number;
};

export type PublicationDeliveryReport = {
  id: string;
  generation: number;
  complete: boolean;
  receipts: PublicationReceipt[];
  permanent?: boolean;
};

export type PublicationOutboxStore = {
  claimDue(): Promise<PublicationOutboxRow[]>;
  recordDelivery(report: PublicationDeliveryReport): Promise<void>;
};

export type PublicationTransport = {
  dispatch(targets: readonly PublicationTarget[], revisions: ReadonlyArray<{ slug: string; revision: string | null }>): Promise<PublicationReceipt[]>;
};

export type TranslationIntentQueue = {
  enqueue(jobSlug: string, row: PublicationOutboxRow): Promise<void>;
};

export type PublicationDeliveryRun = {
  claimed: number;
  completed: number;
  retried: number;
  skipped: number;
};

export function publicationOutboxKey(target: PublicationTarget): string {
  return JSON.stringify(target.kind === "article" ? { kind: target.kind, slug: target.slug } : target);
}

export function hasTranslationIntent(receipts: readonly OutboxReceipt[] | undefined, generation: number): boolean {
  return (receipts ?? []).some((receipt) => receipt.target === TRANSLATION_QUEUE_RECEIPT && receipt.generation === generation);
}

function translationJobSlugFor(target: PublicationTarget): string | null {
  switch (target.kind) {
    case "article": return target.slug;
    case "contributor": return `profile/${target.slug}`;
    case "effect": case "report": case "library": case "replication": return `${target.kind}/${target.slug}`;
    default: return null;
  }
}

export type PublicationStatus = {
  key: string;
  state: "pending" | "delivered" | "failed" | "missing";
  translations: "queued" | "pending" | "not-needed";
};

export function publicationStatus(
  target: PublicationTarget,
  row: Pick<PublicationOutboxRow, "generation" | "pending" | "receipts" | "deadLetteredAt"> | null,
): PublicationStatus {
  const key = publicationOutboxKey(target);
  const translatable = translationJobSlugFor(target) !== null;
  if (!row) return { key, state: "missing", translations: translatable ? "pending" : "not-needed" };
  const state = row.deadLetteredAt !== undefined && row.deadLetteredAt !== null ? "failed" : row.pending ? "pending" : "delivered";
  const translations = !translatable ? "not-needed" : hasTranslationIntent(row.receipts, row.generation) ? "queued" : "pending";
  return { key, state, translations };
}

function publicationRetryDelayMs(attempts: number): number {
  return Math.min(300_000, 15_000 * 2 ** Math.min(attempts, 5));
}

type CurrentRow = Pick<PublicationOutboxRow, "generation" | "pending" | "receipts"> & {
  target?: { kind?: string; dependency?: SubstancePublicationDependency };
  revision?: string | null;
};

export function pendingPublicationRow(
  current: CurrentRow | null,
  entry: PublicationOutboxEntry,
  now: number,
  origin: PublicationOrigin,
): Omit<PublicationOutboxRow, "_id" | "deadLetteredAt"> {
  const target: PublicationTarget = entry.target.kind === "article" && current?.pending === true && current.target?.kind === "article"
    ? { ...entry.target, dependency: mergeSubstancePublicationDependency(current.target.dependency, entry.target.dependency) }
    : entry.target;
  const generation = (current?.generation ?? 0) + 1;
  const editorialStillNeedsLocaleWork = current?.pending === true && !hasTranslationIntent(current.receipts, current.generation);
  const translationDone = origin === "translation" && !editorialStillNeedsLocaleWork;
  return {
    key: publicationOutboxKey(entry.target),
    target,
    revision: entry.revision !== undefined ? entry.revision : current?.pending ? current.revision : undefined,
    generation,
    pending: true,
    nextAttemptAt: now,
    attempts: 0,
    receipts: translationDone ? [{ target: TRANSLATION_QUEUE_RECEIPT, generation, status: "accepted", attempts: 1, jobs: [] }] : [],
    committedAt: now,
  };
}

type RowPatch = Partial<Omit<PublicationOutboxRow, "_id">>;

export function planPublicationClaim<Row extends Pick<PublicationOutboxRow, "_id" | "attempts">>(
  fresh: readonly Row[],
  due: readonly Row[],
  now: number,
): { claims: Array<{ row: Row; patch: RowPatch }>; deadLetters: Array<{ row: Row; patch: RowPatch }> } {
  const freshRows = fresh.slice(0, PUBLICATION_OUTBOX_CLAIM_LIMIT);
  const freshIds = new Set(freshRows.map((row) => row._id));
  const retries = due.filter((row) => !freshIds.has(row._id)).slice(0, PUBLICATION_OUTBOX_CLAIM_LIMIT - freshRows.length);
  const claims = [...freshRows];
  const deadLetters: Array<{ row: Row; patch: RowPatch }> = [];
  for (const row of retries) {
    if (row.attempts >= PUBLICATION_OUTBOX_MAX_ATTEMPTS) {
      deadLetters.push({ row, patch: { pending: false, nextAttemptAt: 0, deadLetteredAt: now } });
    } else {
      claims.push(row);
    }
  }
  return {
    claims: claims.map((row) => ({ row, patch: { nextAttemptAt: now + PUBLICATION_OUTBOX_LEASE_MS, attempts: row.attempts + 1 } })),
    deadLetters,
  };
}

export function settlePublicationDelivery(
  current: Pick<PublicationOutboxRow, "generation" | "attempts" | "receipts">,
  report: Omit<PublicationDeliveryReport, "id">,
  now: number,
): RowPatch | null {
  if (current.generation !== report.generation) return null;
  const deadLetter = !report.complete && (report.permanent === true || current.attempts >= PUBLICATION_OUTBOX_MAX_ATTEMPTS);
  return {
    pending: !report.complete && !deadLetter,
    nextAttemptAt: report.complete || deadLetter ? 0 : now + publicationRetryDelayMs(current.attempts),
    ...(deadLetter ? { deadLetteredAt: now } : {}),
    receipts: [
      ...current.receipts.filter((receipt) => receipt.target === TRANSLATION_QUEUE_RECEIPT && receipt.generation === report.generation),
      ...report.receipts,
    ],
  };
}

async function deliverRow(
  row: PublicationOutboxRow,
  ports: { store: PublicationOutboxStore; transport: PublicationTransport; translations: TranslationIntentQueue },
): Promise<"completed" | "retried" | "skipped"> {
  const report = (fields: Omit<PublicationDeliveryReport, "id" | "generation">) =>
    ports.store.recordDelivery({ id: row._id, generation: row.generation, ...fields });
  if (!isPublicationTarget(row.target)) {
    await report({ complete: false, permanent: true, receipts: [{ target: "publication-target", status: "rejected", attempts: 1,
      detail: "Stored target is not a known publication identity" }] });
    return "skipped";
  }
  const jobSlug = translationJobSlugFor(row.target);
  if (jobSlug && !hasTranslationIntent(row.receipts, row.generation)) {
    try {
      await ports.translations.enqueue(jobSlug, row);
    } catch (error) {
      await report({ complete: false, receipts: [{ target: "translation-queue-failure", status: "unreachable", attempts: 1,
        detail: error instanceof Error ? error.message : "Translation enqueue failed" }] });
      return "retried";
    }
  }
  const revisions = row.target.kind === "article" && row.revision !== undefined
    ? [{ slug: row.target.slug, revision: row.revision }] : [];
  const receipts = await ports.transport.dispatch([row.target], revisions);
  const complete = receipts.length > 0 && receipts.every((receipt) =>
    receipt.status === "accepted" && (revisions.length === 0 || receipt.verification === "verified"));
  await report({ complete, receipts });
  return complete ? "completed" : "retried";
}

export async function deliverDuePublications(
  ports: { store: PublicationOutboxStore; transport: PublicationTransport; translations: TranslationIntentQueue },
): Promise<PublicationDeliveryRun> {
  const rows = await ports.store.claimDue();
  const run: PublicationDeliveryRun = { claimed: rows.length, completed: 0, retried: 0, skipped: 0 };
  for (let start = 0; start < rows.length; start += DELIVERY_CONCURRENCY) {
    const outcomes = await Promise.all(rows.slice(start, start + DELIVERY_CONCURRENCY).map((row) => deliverRow(row, ports)));
    for (const outcome of outcomes) run[outcome] += 1;
  }
  return run;
}
