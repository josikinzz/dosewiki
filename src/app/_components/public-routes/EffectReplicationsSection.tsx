import Link from "next/link";
import { ArticleSection } from "@/components/common/ArticleSection";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { MediaPlaceholder } from "@/components/layout/PublicFeedbackPrimitives";
import { ReplicationGallery } from "@/features/effects/components/ReplicationGallery";
import { getPublicRoutePath } from "@/utils/publicRouteIdentity";
import { buildReplicationViewerUrl } from "@/features/replications/galleryUrlState";
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
          // The collection page remains underneath the deep-linked overlay,
          // so closing returns to a complete, shareable effect playlist.
          <p className="mt-4 text-sm">
            <Link
              href={buildReplicationViewerUrl(
                getPublicRoutePath({
                  family: "replicationEffect",
                  params: { slug: effectSlug },
                }),
                replications[0].slug,
              )}
              className={proseLinkClassName}
            >
              Browse all {replications.length} replication
              {replications.length === 1 ? "" : "s"}
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
