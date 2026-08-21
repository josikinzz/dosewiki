import { ReplicationViewer } from "@/features/replications/viewer/ReplicationViewer";
import {
  findViewerIndex,
  type ReplicationViewerSet,
} from "@/features/replications/viewer/viewerModel";
import type { ReplicationWithUrl } from "@/types/replications";
import type { EffectCategoryLink } from "./replicationSubject";

export interface ReplicationDetailPageProps {
  replication: ReplicationWithUrl;
  effectName: string | null;
  effectSlug: string | null;
  /** Profile page of the credited artist, absent when no profile claims them. */
  artistProfileHref: string | null;
  /** Category pages the replicated effect belongs to, broad to specific. */
  effectCategories: EffectCategoryLink[];
  /** The full ordered walk the viewer moves through; contains this item. */
  viewerSet: ReplicationViewerSet;
}

/**
 * One replication, addressable. The media is the page's subject, so nothing is
 * drawn on top of it — title and credit sit above the stage, provenance and
 * licensing below. That split is what makes the licence legible at the moment
 * someone arrives from a shared link, which is the whole point of the
 * permalink. The page itself is a thin server shell: the stage, the filmstrip,
 * and the metadata all live in the client viewer, because prev/next moves the
 * reader between works without a document load and every one of those blocks
 * has to describe the work actually on the stage.
 */
export function ReplicationDetailPage({
  replication,
  effectName,
  effectSlug,
  artistProfileHref,
  effectCategories,
  viewerSet,
}: ReplicationDetailPageProps) {
  // The walk selector guarantees the active item is a member of the set it
  // returns, but this page is the last place able to make that true: a set
  // that somehow omitted the item it opened on would put some *other* work
  // under this URL's title and licence metadata. Degrade to a one-item walk
  // built from the page's own props instead.
  const set: ReplicationViewerSet =
    findViewerIndex(viewerSet, replication.slug) >= 0
      ? viewerSet
      : {
          scope: viewerSet.scope,
          scopeLabel: null,
          items: [{ replication, effectName, effectSlug, effectCategories, artistProfileHref }],
        };

  return (
    // The stage is full-bleed, so the shell that used to clamp the whole page
    // to prose width now wraps only the metadata (inside the viewer). This
    // element keeps the focus target the skip link points at.
    <main id="main-content" tabIndex={-1} className="min-h-screen w-full pb-20 focus:outline-none">
      <ReplicationViewer initialSlug={replication.slug} set={set} />
    </main>
  );
}
