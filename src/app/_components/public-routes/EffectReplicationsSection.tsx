import {
  ArticleSection,
  ArticleSubsectionCard,
} from "@/components/common/ArticleSection";
import { MediaPlaceholder } from "@/components/layout/PublicFeedbackPrimitives";
import { ReplicationGallery } from "@/features/effects/components/ReplicationGallery";
import { getPublicReplicationsByEffect } from "@server/convex/publicData";

export async function EffectReplicationsSection({
  effectSlug,
  galleryOrder,
}: {
  effectSlug: string;
  galleryOrder?: string[];
}) {
  const replications = await getPublicReplicationsByEffect(effectSlug);

  return (
    <ArticleSection
      id="replications"
      icon="lucide:image"
      heading="Replications"
      spacing="effect"
    >
      <ArticleSubsectionCard padding="sm" variant="nested" className="sm:p-6">
        <ReplicationGallery galleryOrder={galleryOrder} replications={replications} />
      </ArticleSubsectionCard>
    </ArticleSection>
  );
}

export function EffectReplicationsSectionFallback() {
  return (
    <ArticleSection
      id="replications"
      icon="lucide:image"
      heading="Replications"
      spacing="effect"
      aria-busy="true"
      aria-live="polite"
    >
      <ArticleSubsectionCard
        padding="sm"
        variant="nested"
        className="sm:p-6"
      >
        <div className="aspect-[4/3] overflow-hidden rounded-xl">
          <MediaPlaceholder
            kind="loading"
            title="Loading replications"
            description="Visual media is being prepared."
          />
        </div>
      </ArticleSubsectionCard>
    </ArticleSection>
  );
}
