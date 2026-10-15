import type { ReactNode } from "react";
import type { AppRole } from "@/lib/auth/roles";
import type { DevModePrimaryTab } from "./devModePageUtils";
import type { DevModeTab, DevTabDescriptor, DevToolGroup } from "./devTabRegistry";
import type { DevUtility } from "./devUtilities";

export type ToolTabItem = Pick<DevTabDescriptor, "id" | "label" | "icon" | "role" | "destination"> & {
  badge?: number;
  stale?: boolean;
  atLeast?: boolean;
  rollsUpIntake?: boolean;
  unsaved?: boolean;
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
  onOpenHref?: (href: string) => void;
};

export type DevModeToolSheetProps = DevModeToolNavigationProps & {
  groups: readonly GroupView[];
  locked: readonly LockedToolItem[];
  activePrimaryTab: DevModePrimaryTab;
  activeLabel: string;
  activeIcon: string;
  attention?: number;
  attentionStale?: boolean;
  attentionAtLeast?: boolean;
  unsavedAnywhere?: boolean;
  changeLogLockReason: string | null;
  utilities: readonly DevUtility[];
  onPrimaryTabChange: (tab: DevModePrimaryTab) => void;
  onOpenPalette: () => void;
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
  onOpenPath?: (path: string) => void;
  glossaryLocales?: readonly string[];
  onSignIn: () => void;
  onLeave: () => void;
};
