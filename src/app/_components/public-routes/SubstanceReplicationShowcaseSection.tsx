import { ReplicationShowcase } from "@/features/replications/components/ReplicationShowcase";
import { SHOWCASE_WORK_CAP } from "@/features/replications/components/showcaseWork";
import { getRequestLocale } from "@/i18n/server";
import { getSubstanceShowcaseWorks } from "./showcaseCollections";

/**
 * The substance article's Replication Showcase, streamed as the final content
 * in the Subjective Effects section.
 *
 * A substance with no matched works renders nothing at all — the Suspense
 * fallback around this section is null for the same reason — so an unmatched
 * article's layout is byte-identical to one that never had the section.
 *
 * Only the compact strip is serialized into the RSC payload; the expanded
 * viewer's long tail is fetched on demand through `collectionSource`, walking
 * the same `getSubstanceShowcaseWorks` path so both agree on ordering.
 */
export async function SubstanceReplicationShowcaseSection({
  slug,
}: {
  slug: string;
}) {
  // The mirror reads the same collection with the effect names translated.
  const locale = getRequestLocale();
  const collection = await getSubstanceShowcaseWorks(slug, locale);
  if (!collection || collection.works.length === 0) return null;
  const { works, collectionLabel } = collection;

  return (
    <ReplicationShowcase
      works={works.slice(0, SHOWCASE_WORK_CAP)}
      totalCount={works.length}
      substanceSlug={slug}
      collectionLabel={collectionLabel}
      collectionSource={{ kind: "substance", slug }}
    />
  );
}
