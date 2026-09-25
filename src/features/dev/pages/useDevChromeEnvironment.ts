import { useEffect, useMemo } from "react";

import { useMediaQuery } from "@/hooks/useMediaQuery";

import { useUnsavedWork } from "../components/unsavedWork";

import { findDevTab, type DevModeTab } from "./devTabRegistry";

/** The registry id for the shared draft; it belongs to no single rail tab. */
export const SHARED_DRAFT_ENTRY_ID = "shared-draft";
// Leaving drops the in-memory draft on its own; nothing more to clear.
const NO_OP = () => {};

export function useDevChromeEnvironment({
  activeTab,
  close,
  hasPendingChanges,
  onTabNoticeClear,
}: {
  activeTab: DevModeTab;
  close: () => void;
  hasPendingChanges: boolean;
  onTabNoticeClear: (tab: DevModeTab) => void;
}) {
  const enableStickyPanels = useMediaQuery("(pointer: fine)");

  // The shared draft (article and layout edits waiting for Commit) outlives a
  // rail switch but not the editor, so it only stops Leave, sign-out and a
  // browser unload. It has no one-step save: Commit asks its own questions.
  useUnsavedWork({
    id: SHARED_DRAFT_ENTRY_ID,
    label: "Draft edits not yet committed",
    dirty: hasPendingChanges,
    discard: NO_OP,
    keepsOnTabSwitch: true,
  });

  // "Leave the editor" is a button, never a key: Escape belongs to whatever
  // menu, dialog or field has focus. The chrome asks the unsaved-work
  // registry before it calls this, then `close()` returns to the page the
  // editor came from.
  const leaveEditor = close;

  useEffect(() => {
    onTabNoticeClear(activeTab);
  }, [activeTab, onTabNoticeClear]);

  /**
   * The toolbar spans the viewport on every tab, but the tools below it do not.
   * Only the surfaces drawn for edge-to-edge space (rails beside grids, wide
   * tables beside drawers, the layout board) declare `layout: "full-bleed"` in
   * the registry and keep the whole width. The Review workbench is its own
   * route (`/review`) and sets its own width. Every other tool is a form stack
   * that reads badly when stretched, so it goes back to the 6xl column.
   */
  const contentWrapperClass = useMemo(
    () => (findDevTab(activeTab).layout === "full-bleed" ? "mt-6 w-full" : "mx-auto mt-6 w-full max-w-6xl"),
    [activeTab],
  );

  return {
    enableStickyPanels,
    leaveEditor,
    mainClassName: "w-full px-4 py-6 theme-text-primary md:px-6 lg:px-8",
    contentWrapperClass,
  };
}
