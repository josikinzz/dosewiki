/**
 * The SQL enqueue adapter of the publication outbox
 * (`lib/next/publicationOutbox.ts`) for callers that hold a raw Postgres
 * transaction: reviewed-section publication and translation completion. The
 * row value comes from the shared policy, so identity, coalescing, generation
 * and dead-letter re-pend match the runtime writer exactly.
 */
import {
  pendingPublicationRow,
  publicationOutboxKey,
  type PublicationOrigin,
  type PublicationOutboxEntry,
  type PublicationOutboxRow,
} from "../next/publicationOutbox";
import { isPublicationTarget } from "../next/publicationWire";
import { insertDocument, patchDocument, selectDocuments, type SqlClient } from "./documentStore";

/** Canonical lock order, one entry per identity (the last one wins). */
function byIdentity(entries: readonly PublicationOutboxEntry[]): Array<[string, PublicationOutboxEntry]> {
  for (const { target } of entries) {
    if (!isPublicationTarget(target)) throw new Error("Invalid publication outbox target.");
  }
  return [...new Map(entries.map((entry) => [publicationOutboxKey(entry.target), entry])).entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
}

async function lockRow(client: SqlClient, key: string): Promise<PublicationOutboxRow | null> {
  const [row] = await selectDocuments(client, "publicCachePublications", { where: '"key" = $1', params: [key], limit: 1, forUpdate: true });
  return (row as PublicationOutboxRow | undefined) ?? null;
}

/**
 * Lock the existing outbox rows for these targets. A caller that must lock
 * other rows first (translation completion locks its job row) calls this
 * before them so every writer takes outbox rows first and cannot deadlock
 * against publication delivery, which locks the outbox row before the queue.
 */
export async function lockPublications(client: SqlClient, entries: readonly PublicationOutboxEntry[]): Promise<void> {
  for (const [key] of byIdentity(entries)) await lockRow(client, key);
}

/** Upsert one pending outbox row per identity inside the caller's transaction. */
export async function enqueuePublications(
  client: SqlClient,
  entries: readonly PublicationOutboxEntry[],
  options: { now: number; origin: PublicationOrigin },
): Promise<void> {
  for (const [key, entry] of byIdentity(entries)) {
    const current = await lockRow(client, key);
    const value = pendingPublicationRow(current, entry, options.now, options.origin);
    // A new commit re-pends a dead-lettered identity.
    if (current) await patchDocument(client, "publicCachePublications", current._id, { ...value, deadLetteredAt: undefined });
    else await insertDocument(client, "publicCachePublications", value);
  }
}
