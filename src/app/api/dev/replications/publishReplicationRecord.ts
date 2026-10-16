import { LIVE_LOCALE_CODES } from "@server/next/localeHostPolicy";
import type { PublicationTarget } from "@server/next/publicationWire";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { enqueueTranslationJobs } from "@server/translation/segmentStore";

export async function publishReplicationRecord(
  slug: string,
  targets: readonly PublicationTarget[],
): Promise<void> {
  await publishReplicationRecords([slug], targets);
}

export async function publishReplicationRecords(
  slugs: readonly string[],
  targets: readonly PublicationTarget[],
): Promise<void> {
  try {
    await enqueueTranslationJobs(LIVE_LOCALE_CODES, slugs.map((slug) => `replication/${slug}`));
  } catch (error) {
    console.warn("[replications] translation enqueue failed", {
      slugs,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  await publishPublicCache({
    targets: [...targets, ...slugs.map((slug) => ({ kind: "replication" as const, slug }))],
    source: "manual",
  });
}
