import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/PageHeader";
import { ReplicationsTabNav } from "@/features/replications/components/ReplicationsTabNav";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";
import { getCopy } from "@server/next/copyBlocks";

// The header, intro, and tab bar are shared chrome for every tab of the
// replications section (Gallery, Tutorials, Audio). The intro is editable
// copy — a Convex read — so the segment follows the other index pages onto the
// hourly ISR window; a Copy Studio save revalidates it immediately through the
// shared copy cache tag.
export const revalidate = 3600;

const INTRO =
  "Image, video, and audio recreations of the sensory experiences produced by subjective effects.";

/**
 * Shared shell for the replications section's tab routes. The replication
 * permalinks (`/replications/[slug]`) sit outside the `(tabs)` group on
 * purpose: a single work's page is not a section view and gets no tab bar.
 *
 * The main element is deliberately full width (the same hosting environment
 * the gallery had on /effects); the header, intro, and tabs sit left-aligned
 * on the gallery's own `max-w-7xl` measure so everything shares one edge.
 */
export default async function ReplicationsSectionLayout({
  children,
}: {
  children: ReactNode;
}) {
  const copy = await getCopy();

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full px-4 pb-20 pt-4 focus:outline-none 2xl:px-8">
      {/* Left-aligned on the gallery card's own measure, so the title, tabs,
          and card share one edge; the header keeps a deliberately short
          footprint — the media below is the point of the page. */}
      <div className="mx-auto w-full max-w-7xl">
        <PageHeader
          align="left"
          className="mb-4 gap-2"
          titleClassName="[--type-size-title:2.25rem] md:[--type-size-title:3rem]"
          title="Replications"
          description={copy.text("replications-intro") || INTRO}
          descriptionClassName="theme-text-secondary max-w-3xl text-base"
          icon={resolveRouteChromeIcon("replications")}
          prominentMobileIcon
        />
        <ReplicationsTabNav className="mt-2" />
      </div>
      {children}
    </main>
  );
}
