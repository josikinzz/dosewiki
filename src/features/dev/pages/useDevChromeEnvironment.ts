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

  const leaveEditor = close;

  useEffect(() => {
    onTabNoticeClear(activeTab);
  }, [activeTab, onTabNoticeClear]);

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
