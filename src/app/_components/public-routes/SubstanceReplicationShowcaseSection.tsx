import { ReplicationShowcase } from "@/features/replications/components/ReplicationShowcase";
import { SHOWCASE_WORK_CAP } from "@/features/replications/components/showcaseWork";
import { getRequestLocale } from "@/i18n/server";
import { getSubstanceShowcaseWorks } from "@server/replications/showcaseCollections";

export async function SubstanceReplicationShowcaseSection({
  slug,
}: {
  slug: string;
}) {
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
