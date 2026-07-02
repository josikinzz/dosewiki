import { useEffect, useMemo, useState } from "react";

import type { DevModeTab } from "./devModePageUtils";

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

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
      if (event.key !== "Escape") {
        return;
      }

      // Leave Escape alone when something else already handled it (dialogs,
      // menus, IME composition) or when the user is focused in a field.
      if (event.defaultPrevented || event.isComposing || isEditableEventTarget(event.target)) {
        return;
      }

      if (
        hasPendingChanges &&
        !window.confirm("Leave the editor? Unsaved changes will be lost.")
      ) {
        return;
      }

      close();
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [close, hasPendingChanges]);

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
