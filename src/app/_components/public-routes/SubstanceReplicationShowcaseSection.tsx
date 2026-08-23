import { hasKnownCreator } from "@/features/effects/components/replicationCredit";
import { ReplicationShowcase } from "@/features/replications/components/ReplicationShowcase";
import {
  buildShowcaseWorks,
  SHOWCASE_WORK_CAP,
  visualEffectNameBySlug,
} from "@/features/replications/components/showcaseModel";
import type { SubstanceArticle } from "@/schema";
import { publicHref } from "@/utils/publicHref";
import { findContributorProfileByAuthorName } from "@server/contributorProfileIdentity";
import {
  getPublicContributorProfiles,
  getPublicReplicationsForSubstance,
} from "@server/convex/publicData";

/**
 * The substance article's Replication Showcase, streamed as an async server
 * section into the Subjective Effects visual group.
 *
 * A substance with no matched works renders nothing at all — the Suspense
 * fallback around this section is null for the same reason — so an unmatched
 * article's layout is byte-identical to one that never had the section.
 */
export async function SubstanceReplicationShowcaseSection({
  article,
  slug,
}: {
  article: SubstanceArticle;
  slug: string;
}) {
  const gallery = await getPublicReplicationsForSubstance(slug);
  if (gallery.items.length === 0) return null;

  // Bylines link the Artist Page when the work proves one exists; the profile
  // resolver below is only the fallback for works withheld from artist views.
  // Only a credit that names a person can resolve to a profile; a gallery of
  // unattributed works skips the read rather than paying for a lookup that
  // cannot succeed — same reasoning as the permalink loader.
  const anyKnownCreator = gallery.items.some((item) =>
    hasKnownCreator(item.replication.artist),
  );
  const contributorProfiles = anyKnownCreator
    ? await getPublicContributorProfiles()
    : [];

  const works = buildShowcaseWorks(
    gallery.items,
    visualEffectNameBySlug(article.subjective_effects),
    (artistName) => {
      const profile = findContributorProfileByAuthorName(
        contributorProfiles,
        artistName,
      );
      return profile ? publicHref.contributor(profile.key) : null;
    },
  );
  if (works.length === 0) return null;

  return (
    <ReplicationShowcase
      works={works.slice(0, SHOWCASE_WORK_CAP)}
      totalCount={works.length}
      substanceSlug={slug}
      collectionLabel={`${article.title} replications`}
    />
  );
}
