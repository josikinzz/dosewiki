import Link from "next/link";
import { getRequestLocale, t } from "@/i18n/server";
import { ArticleSection } from "@/components/common/ArticleSection";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { SkeletonPulse } from "@/components/layout/PublicFeedbackPrimitives";
import { ReplicationShowcase } from "@/features/replications/components/ReplicationShowcase";
import { SHOWCASE_WORK_CAP } from "@/features/replications/components/showcaseWork";
import { buildReplicationViewerUrl } from "@/features/replications/galleryUrlState";
import { publicHref } from "@/utils/publicHref";
import { getEffectShowcaseWorks } from "./showcaseCollections";

/**
 * Effect articles use the same compact showcase and expanded viewer as
 * substance articles. The owning effect controls the playlist identity; the
 * work permalink remains available through modified clicks and new tabs.
 *
 * The works are built server-side and only the compact strip is serialized;
 * the expanded viewer's long tail is fetched on demand through
 * `collectionSource`, walking the same `getEffectShowcaseWorks` path.
 */
export async function EffectReplicationsSection({
  effectSlug,
}: {
  effectSlug: string;
}) {
  const locale = getRequestLocale();
  const collection = await getEffectShowcaseWorks(effectSlug, locale);
  const works = collection?.works ?? [];
  const effectName = collection?.effectName;

  return (
    <ArticleSection
      id="replications"
      icon="lucide:image"
      heading={t("Replications")}
      spacing="effect"
    >
      <div className="mt-6">
        {works.length > 0 ? (
          <>
            <ReplicationShowcase
              works={works.slice(0, SHOWCASE_WORK_CAP)}
              totalCount={works.length}
              effectSlug={effectSlug}
              collectionLabel={t("{{name}} replications", {
                name: effectName ?? effectSlug.replace(/-/g, " "),
              })}
              collectionSource={{ kind: "effect", slug: effectSlug }}
            />
            {/* The collection page remains underneath the deep-linked overlay,
                so closing returns to a complete, shareable effect playlist. */}
            <p className="mt-4 text-sm">
              <Link
                href={buildReplicationViewerUrl(
                  publicHref.effect(effectSlug),
                  works[0].slug,
                )}
                className={proseLinkClassName}
              >
                {t("Browse all {count, plural, =0 {# replications} one {# replication} other {# replications}}", {
                  count: works.length,
                })}
              </Link>
            </p>
          </>
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
      heading={t("Replications")}
      spacing="effect"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mt-6 aspect-video max-h-[380px] overflow-hidden rounded-xl" aria-label={t("Loading replications")}>
        <SkeletonPulse height="h-full" className="rounded-none" />
      </div>
    </ArticleSection>
  );
}
