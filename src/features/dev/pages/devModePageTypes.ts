import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import type { useDevModeChangeLog } from "./useDevModeChangeLog";
import type { DevModePrimaryTab, DevModeTab } from "./devModePageUtils";
import type { useDevSupportTabsController } from "./useDevModeSupportTabProps";

export type DevModePageProps = {
  activeTab: DevModeTab;
  initialArticleSlug?: string;
  initialProfileKey?: string;
  /** True while the editor corpus is still draining behind the shell. */
  isLibraryLoading?: boolean;
  onTabChange: (tab: DevModeTab) => void;
};

export type DevModePageChromeSessionStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated";

export type DevModePageControllerState = {
  activePrimaryTab: DevModePrimaryTab;
  mainClassName: string;
  contentWrapperClass: string;
  hasProfileSession: boolean;
  hasNextEditorSession: boolean;
  sessionStatus: DevModePageChromeSessionStatus;
  userEmail?: string | null;
  userImage?: string | null;
  userName?: string | null;
  articlesLength: number;
  isLibraryLoading: boolean;
  activeTab: DevModeTab;
  changeLog: ReturnType<typeof useDevModeChangeLog>;
  commitPanel: ReturnType<
    typeof import("./useDevModeSaveActions").useDevModeSaveActions
  >["commitPanel"];
  renderCommitPanel: ReturnType<
    typeof import("./useDevModeSaveActions").useDevModeSaveActions
  >["renderCommitPanel"];
  citationReviewInitialSlug?: string;
  moleculeEditorInitialSlug?: string;
  profileTabProps: ReturnType<typeof useDevSupportTabsController>["profileTabProps"];
  aboutTabProps: ReturnType<typeof useDevSupportTabsController>["aboutTabProps"];
  tagEditorTabProps: ReturnType<typeof useDevSupportTabsController>["tagEditorTabProps"];
  profileHistory: ChangeLogEntry[];
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
  onSignIn: () => void;
};
