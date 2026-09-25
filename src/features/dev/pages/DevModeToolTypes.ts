import type { ReactNode } from "react";
import type { AppRole } from "@/lib/auth/roles";
import type { DevModePrimaryTab } from "./devModePageUtils";
import type { DevModeTab, DevTabDescriptor, DevToolGroup } from "./devTabRegistry";
import type { DevUtility } from "./DevUtilitiesMenu";

export type ToolTabItem = Pick<DevTabDescriptor, "id" | "label" | "role" | "destination"> & {
  badge?: number;
  /** This tab's badge sums every intake count (the Inbox), so group menus stop rolling theirs up. */
  rollsUpIntake?: boolean;
  /** A registered entry for this tab holds unsaved work. */
  unsaved?: boolean;
  /** Set while the session is still resolving: the tab renders, but waits. */
  pending?: string;
};

export type LockedToolItem = ToolTabItem & { reason: string };

export type GroupView = {
  id: DevToolGroup;
  label: string;
  enabled: ToolTabItem[];
  locked: LockedToolItem[];
};

export type DevModeToolNavigationProps = {
  activeTab: DevModeTab;
  isToolsSection: boolean;
  onTabChange: (tab: DevModeTab) => void;
};

export type DevModeToolSheetProps = DevModeToolNavigationProps & {
  groups: readonly GroupView[];
  activePrimaryTab: DevModePrimaryTab;
  activeLabel: string;
  changeLogLockReason: string | null;
  /** The utility routes this role may open. */
  utilities: readonly DevUtility[];
  onPrimaryTabChange: (tab: DevModePrimaryTab) => void;
  onLeave: () => void;
  session: ReactNode;
};

export type DevModePageChromeProps = {
  activePrimaryTab: DevModePrimaryTab;
  activeTab: DevModeTab;
  isSignedIn: boolean;
  role: AppRole | null;
  sessionStatus: "loading" | "authenticated" | "unauthenticated";
  userEmail?: string | null;
  userImage?: string | null;
  userName?: string | null;
  onPrimaryTabChange: (tab: DevModePrimaryTab) => void;
  onTabChange: (tab: DevModeTab) => void;
  onSignIn: () => void;
  onLeave: () => void;
};
