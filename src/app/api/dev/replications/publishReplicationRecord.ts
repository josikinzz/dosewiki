/**
 * The publication every studio write that can change a replication's title
 * performs: the keyed `replication` identity expires the permalink, the
 * viewer document, the gallery index and their locale mirrors, and the
 * `replication/<slug>` translation job lets the refresh cron bring the
 * mirror's title up to date. The mirror follows by cron, not inline; a failed
 * enqueue is logged and the next write to the record retries it.
 */
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

/** The same publication for several records at once, such as a bulk Publish. */
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
