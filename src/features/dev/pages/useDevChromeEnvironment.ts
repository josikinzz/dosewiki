import { useEffect, useMemo, useState } from "react";

import type { DevModeTab } from "./devTabRegistry";

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

  // Escape means "leave the editor": the tools sit as an overlay over the
  // public site and `close()` returns to the substances index.
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

  /**
   * The toolbar spans the viewport on every tab, but the tools below it do not.
   * Only the surfaces drawn for edge-to-edge space keep the whole width: the
   * Index layout board, the Replication Studio (rail + grid + drawer), the Trip
   * Report Portal (rail + list + editor), and the Banner Studio, whose Presets
   * table carries six columns beside a two-column drawer and whose Coverage view
   * is a 300px substance rail plus a fluid detail column. The Review workbench is
   * its own route (`/review`) and sets its own width. Every other tool is a form
   * stack that reads badly when stretched, so it goes back to the 6xl column.
   */
  const contentWrapperClass = useMemo(() => {
    const isFullBleedTool =
      activeTab === "index-layout" ||
      activeTab === "replications" ||
      activeTab === "banners" ||
      activeTab === "trip-report-submissions";

    return isFullBleedTool ? "mt-6 w-full" : "mx-auto mt-6 w-full max-w-6xl";
  }, [activeTab]);

  return {
    enableStickyPanels,
    mainClassName: "w-full px-4 py-6 text-white md:px-6 lg:px-8",
    contentWrapperClass,
  };
}
