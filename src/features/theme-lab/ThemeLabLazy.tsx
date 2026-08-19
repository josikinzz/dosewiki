"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { setThemeLabOpen, useThemeLabOpen } from "./themeLabStore";
import { ThemeLabRuntimeMount } from "./ThemeLabRuntimeMount";

const ThemeLabPanel = dynamic(() => import("./ThemeLab").then((module) => module.ThemeLab), {
  ssr: false,
});

/**
 * The lab's global mount: the UI-free runtime always, the editor only after its
 * first open.
 *
 * Root layout owns this mount for DoseWiki, so saved edits and the drawer survive
 * navigation. The editor chunk still waits for a reader to open it and then stays
 * mounted across close/reopen.
 */
export function ThemeLabLazy() {
  const open = useThemeLabOpen();
  const [hasEverOpened, setHasEverOpened] = useState(false);

  useEffect(() => () => setThemeLabOpen(false), []);

  useEffect(() => {
    if (open) setHasEverOpened(true);
  }, [open]);

  return (
    <>
      <ThemeLabRuntimeMount />
      {hasEverOpened ? <ThemeLabPanel /> : null}
    </>
  );
}
