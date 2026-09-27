import type { ReactNode } from "react";
import type { AppRole } from "@/lib/auth/roles";
import type { DevModePrimaryTab } from "./devModePageUtils";
import type { DevModeTab, DevTabDescriptor, DevToolGroup } from "./devTabRegistry";
import type { DevUtility } from "./devUtilities";

export type ToolTabItem = Pick<DevTabDescriptor, "id" | "label" | "icon" | "role" | "destination"> & {
  badge?: number;
  /** The badge's latest refresh failed: `badge` is the last known count. */
  stale?: boolean;
  /** The badge sums counts and one never loaded: `badge` is a floor ("13+", "at least 13"). */
  atLeast?: boolean;
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
  /** Leaves the shell for an App Path (Review, a utility) once the unsaved-work registry agrees. */
  onOpenHref?: (href: string) => void;
};

export type DevModeToolSheetProps = DevModeToolNavigationProps & {
  groups: readonly GroupView[];
  /** Every tool the role cannot open (Change log included), folded at the end of the sheet. */
  locked: readonly LockedToolItem[];
  activePrimaryTab: DevModePrimaryTab;
  activeLabel: string;
  /** The open tool's glyph, worn by the bar trigger. */
  activeIcon: string;
  /** The one count the bar shows: the Inbox roll-up when the role has it, else every count summed. */
  attention?: number;
  /** The attention count's latest refresh failed. */
  attentionStale?: boolean;
  /** That count is a floor: a part of it never loaded. */
  attentionAtLeast?: boolean;
  /** Some tool holds unsaved work. */
  unsavedAnywhere?: boolean;
  changeLogLockReason: string | null;
  /** The utility routes this role may open. */
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
  /** Opens a Cmd+K record by App Path, after the unsaved-work registry agrees. Absent: a page load. */
  onOpenPath?: (path: string) => void;
  /** The session's glossary grant, for the palette's Glossary languages. */
  glossaryLocales?: readonly string[];
  onSignIn: () => void;
  onLeave: () => void;
};
