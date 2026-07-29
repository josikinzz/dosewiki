import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import type { useDevModeChangeLog } from "./useDevModeChangeLog";
import type { DevModePrimaryTab, DevModeTab } from "./devModePageUtils";
import type { useDevSupportTabsController } from "./useDevModeSupportTabProps";

export type DevModePageProps = {
  activeTab: DevModeTab;
  initialArticleSlug?: string;
  initialProfileKey?: string;
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
  activeTab: DevModeTab;
  changeLog: ReturnType<typeof useDevModeChangeLog>;
  commitPanel: ReturnType<
    typeof import("./useDevModeSaveActions").useDevModeSaveActions
  >["commitPanel"];
  renderCommitPanel: ReturnType<
    typeof import("./useDevModeSaveActions").useDevModeSaveActions
  >["renderCommitPanel"];
  citationReviewInitialSlug?: string;
  reviewInitialSlug?: string;
  profileTabProps: ReturnType<typeof useDevSupportTabsController>["profileTabProps"];
  aboutTabProps: ReturnType<typeof useDevSupportTabsController>["aboutTabProps"];
  tagEditorTabProps: ReturnType<typeof useDevSupportTabsController>["tagEditorTabProps"];
  profileHistory: ChangeLogEntry[];
  onPrimaryTabChange: (tab: DevModePrimaryTab) => void;
  onTabChange: (tab: DevModeTab) => void;
  onSignIn: () => void;
};
