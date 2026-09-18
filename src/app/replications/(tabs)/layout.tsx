import type { ReactNode } from "react";

import { ReplicationsSectionTitle } from "./_components/ReplicationsSectionTitle";

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
 * same measure so everything shares one edge. The Gallery tab keeps its
 * heading accessible-only so the art starts at the top of the page; see
 * ReplicationsSectionTitle.
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
      className="mx-auto w-full px-4 pb-20 pt-2 focus:outline-none 2xl:px-8"
    >
      <ReplicationsSectionTitle />
      {children}
    </main>
  );
}
