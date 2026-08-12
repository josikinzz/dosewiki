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

  /**
   * Escape means "leave the editor" only on the /dev shell, where the tools sit
   * as an overlay over the public site and `close()` returns to the page the
   * editor was opened from.
   *
   * The review workbench is not an overlay. It is a standalone full-screen
   * surface reached by direct navigation, so `close()` has no origin page to
   * return to and falls back to pushing /substances — which ejects a reviewer
   * mid-pass and discards the custom history stack ReviewExperience maintains
   * with its own pushState/replaceState entries. There, Escape belongs to
   * whatever popover, dialog, or inline edit is open (Radix dismisses those
   * without always calling preventDefault, so this listener would fire on top
   * of them); with nothing open it must do nothing at all.
   */
  const closesOnEscape = activeTab !== "review";

  useEffect(() => {
    if (!closesOnEscape) {
      return;
    }

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
  }, [close, closesOnEscape, hasPendingChanges]);

  useEffect(() => {
    onTabNoticeClear(activeTab);
  }, [activeTab, onTabNoticeClear]);

  /**
   * Dev tools span the full viewport the same way the Subjective Effect Index
   * and Substance Index do: a `main` with horizontal padding and no max-width
   * cap. Every tool gets the whole width; the tabs that still want a reading
   * column set that for themselves.
   */
  const layoutClasses = useMemo(
    () => ({
      mainClassName: "w-full px-4 py-6 text-white md:px-6 lg:px-8",
      contentWrapperClass: "mt-6 w-full",
    }),
    [],
  );

  return {
    enableStickyPanels,
    ...layoutClasses,
  };
}
