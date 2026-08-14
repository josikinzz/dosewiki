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
  "Replications are image, video, and audio recreations of the sensory experiences produced by " +
  "various subjective effects that a user may encounter under the influence of hallucinogens. " +
  "They serve the purpose of documenting certain experiences in a level of detail that " +
  "descriptive language is incapable of describing.";

/**
 * Shared shell for the replications section's tab routes. The replication
 * permalinks (`/replications/[slug]`) sit outside the `(tabs)` group on
 * purpose: a single work's page is not a section view and gets no tab bar.
 *
 * The main element is deliberately full width (the same hosting environment
 * the gallery had on /effects) — the gallery caps itself at `max-w-7xl` while
 * the header, intro, and tabs stay on the narrower reading measure.
 */
export default async function ReplicationsSectionLayout({
  children,
}: {
  children: ReactNode;
}) {
  const copy = await getCopy();

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full px-4 pb-20 pt-12 focus:outline-none 2xl:px-8">
      <div className="mx-auto max-w-3xl md:max-w-4xl">
        <PageHeader
          title="Replications"
          description={copy.text("replications-intro") || INTRO}
          icon={resolveRouteChromeIcon("replications")}
          prominentMobileIcon
        />
        <ReplicationsTabNav className="mt-2" />
      </div>
      {children}
    </main>
  );
}
