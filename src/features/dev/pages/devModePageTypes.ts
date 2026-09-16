import type { NormalizedUserProfile } from "@/data/userProfiles";
import type { AppRole } from "@/lib/auth/roles";
import type { DevIndexLayoutsReadiness, DevProposalSeed } from "../context/devModeTypes";
import type { DevModePrimaryTab } from "./devModePageUtils";
import type { DevModeTab } from "./devTabRegistry";
import type { useDevSupportTabsController } from "./useDevModeSupportTabProps";
import type { ChangeLogController } from "./useDevModeChangeLog";

export type DevModePageProps = {
  activeTab: DevModeTab;
  initialArticleSlug?: string;
  /** See `DevModePageControllerState.initialFilter`. */
  initialFilter?: string;
  initialProfileKey?: string;
  /** True while the editor corpus is still draining behind the shell. */
  isLibraryLoading?: boolean;
  onTabChange: (tab: DevModeTab) => void;
};

type DevModePageChromeSessionStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated";

export type DevModePageControllerState = {
  activePrimaryTab: DevModePrimaryTab;
  mainClassName: string;
  contentWrapperClass: string;
  /** True on a fine pointer: tools may pin their toolbars and side panels. */
  enableStickyPanels: boolean;
  /** An Auth.js session is present. */
  isSignedIn: boolean;
  /** The session role, null while signed out; the rail disables every tab above it. */
  role: AppRole | null;
  /** Admin or editor: may draft saves; the commit panel and save buttons disable without it. */
  canDraft: boolean;
  /** Admin: may approve, delete, and use admin-only fields. */
  canApprove: boolean;
  /** Why the active tab is closed to the settled session, or null when it is open. */
  activeTabLockReason: string | null;
  sessionStatus: DevModePageChromeSessionStatus;
  userEmail?: string | null;
  userImage?: string | null;
  userName?: string | null;
  articlesLength: number;
  isLibraryLoading: boolean;
  indexLayoutsReadiness: DevIndexLayoutsReadiness;
  retryIndexLayouts: () => void;
  activeTab: DevModeTab;
  changeLog: ChangeLogController;
  commitPanel: ReturnType<
    typeof import("./useDevModeSaveActions").useDevModeSaveActions
  >["commitPanel"];
  renderCommitPanel: ReturnType<
    typeof import("./useDevModeSaveActions").useDevModeSaveActions
  >["renderCommitPanel"];
  /** `/dev/articles/<slug>`: the substance the editor opens on. */
  articlesInitialSlug?: string;
  citationReviewInitialSlug?: string;
  moleculeEditorInitialSlug?: string;
  replicationsInitialSlug?: string;
  bannersInitialSlug?: string;
  /**
   * The Writing deep link: `/dev/writing/<slug>`, `/dev/blog/<slug>`, or
   * the literal `about` that `/dev/about` now resolves to.
   */
  writingInitialSlug?: string;
  /** `/dev/copy-studio/<block key>`: the block Copy Studio opens on. */
  copyStudioInitialKey?: string;
  /** `/dev/playlists/<key>`: the playlist the tab opens on. */
  playlistsInitialKey?: string;
  /**
   * The active tab's URL filter value (`/dev/writing?kind=blog`), already
   * validated against the registry descriptor's `filter.values`. Each tab
   * narrows it to its own union.
   */
  initialFilter?: string;
  tagEditorTabProps: ReturnType<typeof useDevSupportTabsController>["tagEditorTabProps"];
  /**
   * The signed-in user's own contributor key, for the Contributors tab's
   * "Just me" scope: the canonical owned key once the server resolves it,
   * else the key derived from the session email.
   */
  sessionProfileKey: string;
  /**
   * The contributor directory, for the Contributors tab's list rail. Fetched by
   * the shell (see `tabNeedsContributorProfiles`) rather than by the tab, so the
   * tab and the save flows share one subscription.
   */
  contributorDirectory: {
    profiles: NormalizedUserProfile[];
    isLoading: boolean;
  };
  onPrimaryTabChange: (tab: DevModePrimaryTab) => void;
  onTabChange: (tab: DevModeTab) => void;
  /** Queue: seed the working set from a proposal, then open the substances editor. */
  onLoadProposal: (seed: DevProposalSeed) => Promise<void>;
  onSignIn: () => void;
  /** Visible "Leave editor" action; the same path Escape takes, confirm included. */
  onLeave: () => void;
};
