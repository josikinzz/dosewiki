import {
  pendingPublicationRow,
  publicationOutboxKey,
  type PublicationOrigin,
  type PublicationOutboxEntry,
  type PublicationOutboxRow,
} from "../next/publicationOutbox";
import { isPublicationTarget } from "../next/publicationWire";
import { insertDocument, patchDocument, selectDocuments, type SqlClient } from "./documentStore";

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

export async function lockPublications(client: SqlClient, entries: readonly PublicationOutboxEntry[]): Promise<void> {
  for (const [key] of byIdentity(entries)) await lockRow(client, key);
}

export async function enqueuePublications(
  client: SqlClient,
  entries: readonly PublicationOutboxEntry[],
  options: { now: number; origin: PublicationOrigin },
): Promise<void> {
  for (const [key, entry] of byIdentity(entries)) {
    const current = await lockRow(client, key);
    const value = pendingPublicationRow(current, entry, options.now, options.origin);
    if (current) await patchDocument(client, "publicCachePublications", current._id, { ...value, deadLetteredAt: undefined });
    else await insertDocument(client, "publicCachePublications", value);
  }
}
