"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { setThemeLabOpen, useThemeLabOpen } from "./themeLabStore";
import { THEME_LAB_STORAGE_KEY } from "./themeLabStorage";

const ThemeLabRuntimeMount = dynamic(
  () => import("./ThemeLabRuntimeMount").then((module) => module.ThemeLabRuntimeMount),
  { ssr: false },
);

const ThemeLabPanel = dynamic(() => import("./ThemeLab").then((module) => module.ThemeLab), {
  ssr: false,
});

export function ThemeLabLazy() {
  const open = useThemeLabOpen();
  const [hasEverOpened, setHasEverOpened] = useState(false);
  const [runtimeNeeded, setRuntimeNeeded] = useState(false);
  const [runtimeReady, setRuntimeReady] = useState(false);

  useEffect(() => {
    const checkSavedEdits = () => {
      try {
        if (window.localStorage.getItem(THEME_LAB_STORAGE_KEY) !== null) setRuntimeNeeded(true);
      } catch {
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === THEME_LAB_STORAGE_KEY) checkSavedEdits();
    };
    checkSavedEdits();
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", checkSavedEdits);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", checkSavedEdits);
    };
  }, []);

  useEffect(() => () => setThemeLabOpen(false), []);

  useEffect(() => {
    if (open) setHasEverOpened(true);
  }, [open]);

  return (
    <>
      {runtimeNeeded || open || hasEverOpened ? <ThemeLabRuntimeMount onReady={setRuntimeReady} /> : null}
      {hasEverOpened && runtimeReady ? <ThemeLabPanel /> : null}
    </>
  );
}
