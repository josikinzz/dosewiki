import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/PageHeader";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";

// The header is shared chrome for every tab of the replications section
// (Gallery, Tutorials, Audio, More Info); the tab bar itself belongs to each
// tab route, so a tab can place standing copy above it. The section's
// description and fair-use notice live on the More Info tab.
export const revalidate = 3600;

/**
 * Shared shell for the replications section's tab routes. The replication
 * permalinks (`/replications/[slug]`) sit outside the `(tabs)` group on
 * purpose: a single work's page is not a section view and gets no tab bar.
 *
 * The main element is deliberately full width (the same hosting environment
 * the gallery had on /effects); the header sits left-aligned on the gallery's
 * own `max-w-7xl` measure, and every tab route renders its own body on that
 * same measure so everything shares one edge.
 */
export default function ReplicationsSectionLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto w-full px-4 pb-20 pt-4 focus:outline-none 2xl:px-8"
    >
      {/* Left-aligned on the gallery card's own measure, so the title, tabs,
          and card share one edge; the header keeps a deliberately short
          footprint — the media below is the point of the page. */}
      <div className="mx-auto w-full max-w-7xl">
        <PageHeader
          align="left"
          className="mb-4 gap-2"
          titleClassName="[--type-size-title:2.25rem] md:[--type-size-title:3rem]"
          title="Replications"
          icon={resolveRouteChromeIcon("replications")}
        />
      </div>
      {children}
    </main>
  );
}
