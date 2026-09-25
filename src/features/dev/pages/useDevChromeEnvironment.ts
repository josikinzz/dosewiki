import { useEffect, useMemo } from "react";

import { useMediaQuery } from "@/hooks/useMediaQuery";

import { findDevTab, type DevModeTab } from "./devTabRegistry";

export function useDevChromeEnvironment({
  activeTab,
  close,
  onTabNoticeClear,
}: {
  activeTab: DevModeTab;
  close: () => void;
  onTabNoticeClear: (tab: DevModeTab) => void;
}) {
  const enableStickyPanels = useMediaQuery("(pointer: fine)");

  // "Leave the editor" is a button, never a key: Escape belongs to whatever
  // menu, dialog or field has focus. The chrome asks the unsaved-work
  // registry before it calls this, then `close()` returns to the page the
  // editor came from. The staged working set is one more registry entry
  // (useStagedSetUnsavedWork), never a special case here.
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
    () => (findDevTab(activeTab).layout === "full-bleed" ? "mt-5 w-full" : "mx-auto mt-5 w-full max-w-6xl"),
    [activeTab],
  );

  return {
    enableStickyPanels,
    leaveEditor,
    mainClassName: "theme-dev-shell w-full px-4 py-6 theme-text-primary md:px-6 lg:px-8",
    contentWrapperClass,
  };
}
