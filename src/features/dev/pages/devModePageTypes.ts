import type { NormalizedUserProfile } from "@/data/userProfiles";
import type { AppRole } from "@/lib/auth/roles";
import type { DevIndexLayoutsReadiness, DevProposalSeed } from "../context/devModeTypes";
import type { DevModePrimaryTab } from "./devModePageUtils";
import type { DevModeTab } from "./devTabRegistry";
import type { useDevSupportTabsController } from "./useDevModeSupportTabProps";
import type { ChangeLogController } from "./useDevModeChangeLog";
import type { StagedArticlesRecovery } from "./useStagedArticlesRecovery";

export type DevModePageProps = {
  activeTab: DevModeTab;
  initialArticleSlug?: string;
  initialFilter?: string;
  initialProfileKey?: string;
  isLibraryLoading?: boolean;
  libraryError?: string | null;
  onRetryLibrary?: () => void;
  onTabChange: (tab: DevModeTab) => void;
  onOpenPath?: (path: string) => void;
  toolMountKey?: number;
};

type DevModePageChromeSessionStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated";

export type DevModePageControllerState = {
  activePrimaryTab: DevModePrimaryTab;
  mainClassName: string;
  contentWrapperClass: string;
  enableStickyPanels: boolean;
  isSignedIn: boolean;
  role: AppRole | null;
  canDraft: boolean;
  canApprove: boolean;
  activeTabLockReason: string | null;
  sessionStatus: DevModePageChromeSessionStatus;
  userEmail?: string | null;
  userImage?: string | null;
  userName?: string | null;
  glossaryLocales?: readonly string[];
  articlesLength: number;
  isLibraryLoading: boolean;
  libraryError: string | null;
  retryLibrary: () => void;
  indexLayoutsReadiness: DevIndexLayoutsReadiness;
  retryIndexLayouts: () => void;
  activeTab: DevModeTab;
  changeLog: ChangeLogController;
  commitPanel: ReturnType<
    typeof import("./useDevModeSaveActions").useDevModeSaveActions
  >["commitPanel"];
  stagedRecovery: StagedArticlesRecovery;
  articlesInitialSlug?: string;
  citationReviewInitialSlug?: string;
  moleculeEditorInitialSlug?: string;
  replicationsInitialSlug?: string;
  bannersInitialSlug?: string;
  writingInitialSlug?: string;
  copyStudioInitialKey?: string;
  tripReportsInitialId?: string;
  queueInitialId?: string;
  feedbackInitialId?: string;
  playlistsInitialKey?: string;
  peopleInitialKey?: string;
  contributorsInitialKey?: string;
  toolMountKey: number;
  initialFilter?: string;
  tagEditorTabProps: ReturnType<typeof useDevSupportTabsController>["tagEditorTabProps"];
  indexLayoutTabProps?: ReturnType<typeof useDevSupportTabsController>["indexLayoutTabProps"];
  sessionProfileKey: string;
  contributorDirectory: {
    profiles: NormalizedUserProfile[];
    isLoading: boolean;
  };
  onPrimaryTabChange: (tab: DevModePrimaryTab) => void;
  onTabChange: (tab: DevModeTab) => void;
  onOpenPath: (path: string) => void;
  onLoadProposal: (seed: DevProposalSeed) => Promise<void>;
  onSignIn: () => void;
  onLeave: () => void;
};
