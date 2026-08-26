import { ReplicationsFairUseNotice } from "@/features/replications/components/ReplicationsFairUseNotice";
import { ReplicationsTabNav } from "@/features/replications/components/ReplicationsTabNav";
import {
  REPLICATIONS_FAIR_USE_NOTICE_FALLBACK,
  REPLICATIONS_FAIR_USE_NOTICE_KEY,
} from "@/features/replications/replicationsFairUseCopy";
import {
  REPLICATIONS_INTRO_FALLBACK,
  REPLICATIONS_INTRO_KEY,
} from "@/features/replications/replicationsInfoCopy";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getCopy } from "@server/next/copyBlocks";

// Both blocks on this page are editable copy — Convex reads — so the segment
// follows the other index pages onto the hourly ISR window; a Copy Studio
// save revalidates it immediately through the shared copy cache tag.
export const revalidate = 3600;

export async function generateMetadata() {
  const copy = await getCopy();

  return buildPublicPageMetadata({
    title: "About Replications",
    description:
      copy.text("seo-replications-more-info-description") ||
      "What replications are, why this art is hosted here, and how artists are credited.",
    route: { family: "replicationInfo" },
  });
}

/**
 * The section's standing prose, moved off the Gallery so the media leads:
 * the description that used to sit under the page title, then the fair-use /
 * takedown notice that used to sit above the tab bar. Both stay editable in
 * the /dev Copy Studio (Replications group).
 */
export default async function ReplicationsInfoPage() {
  const copy = await getCopy();

  return (
    <>
      <ReplicationsTabNav />
      <div className="mx-auto mt-8 w-full max-w-7xl">
        <h2 className="sr-only">More Info</h2>

        <p className="theme-text-secondary max-w-3xl text-base">
          {copy.text(REPLICATIONS_INTRO_KEY) || REPLICATIONS_INTRO_FALLBACK}
        </p>

        <ReplicationsFairUseNotice
          body={
            copy.text(REPLICATIONS_FAIR_USE_NOTICE_KEY) ||
            REPLICATIONS_FAIR_USE_NOTICE_FALLBACK
          }
        />
      </div>
    </>
  );
}
