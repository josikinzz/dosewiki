import Link from "next/link";
import { ArticleSection } from "@/components/common/ArticleSection";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { MediaPlaceholder } from "@/components/layout/PublicFeedbackPrimitives";
import { ReplicationGallery } from "@/features/effects/components/ReplicationGallery";
import { getPublicRoutePath } from "@/utils/publicRouteIdentity";
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
      <div className="mt-6">
        <ReplicationGallery
          galleryOrder={galleryOrder}
          replications={replications}
          effectSlug={effectSlug}
        />
        {replications.length > 0 ? (
          // A real destination, not a viewer mode: the effect's playlist page
          // opens the immersive viewer at the first work and is shareable.
          <p className="mt-4 text-sm">
            <Link
              href={getPublicRoutePath({ family: "replicationEffect", params: { slug: effectSlug } })}
              className={proseLinkClassName}
            >
              View all {replications.length} replication{replications.length === 1 ? "" : "s"} in the immersive viewer
            </Link>
          </p>
        ) : null}
      </div>
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
      <div className="mt-6 aspect-[4/3] overflow-hidden rounded-xl">
        <MediaPlaceholder
          kind="loading"
          title="Loading replications"
          description="Visual media is being prepared."
        />
      </div>
    </ArticleSection>
  );
}
