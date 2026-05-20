import { useEffect, useMemo, useState } from "react";

import type { DevModeTab } from "./devModePageUtils";

export function useDevChromeEnvironment({
  activeTab,
  close,
  onTabNoticeClear,
}: {
  activeTab: DevModeTab;
  close: () => void;
  onTabNoticeClear: (tab: DevModeTab) => void;
}) {
  const [enableStickyPanels, setEnableStickyPanels] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const query = window.matchMedia("(pointer: fine)");
    const update = () => {
      setEnableStickyPanels(query.matches);
    };

    update();

    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", update);
      return () => {
        query.removeEventListener("change", update);
      };
    }

    query.addListener(update);
    return () => {
      query.removeListener(update);
    };
  }, []);

  useEffect(() => {
    const handleKeydown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [close]);

  useEffect(() => {
    onTabNoticeClear(activeTab);
  }, [activeTab, onTabNoticeClear]);

  const layoutClasses = useMemo(() => {
    const isIndexLayoutTab = activeTab === "index-layout";
    return {
      mainClassName: isIndexLayoutTab
        ? "w-full px-4 py-12 text-white md:px-6 lg:px-8"
        : "mx-auto w-full max-w-6xl px-4 py-12 text-white md:px-6 lg:px-8",
      contentWrapperClass: isIndexLayoutTab
        ? "mt-10 w-full"
        : "mx-auto w-full max-w-6xl",
    };
  }, [activeTab]);

  return {
    enableStickyPanels,
    ...layoutClasses,
  };
}
