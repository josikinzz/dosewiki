"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { setPaletteLabOpen, usePaletteLabOpen } from "./paletteLabStore";
import { PaletteLabRuntimeMount } from "./PaletteLabRuntimeMount";
import { SharedThemeInviteMount } from "./SharedThemeInviteMount";

const PaletteLabPanel = dynamic(() => import("./PaletteLab").then((module) => module.PaletteLab), {
  ssr: false,
});

/**
 * The lab's global mount: the UI-free runtime always, the editor only after its
 * first open.
 *
 * Root layout owns this mount for DoseWiki, so saved palettes, shared-theme
 * invites, and the drawer survive navigation. The editor chunk still waits for
 * a reader to open it and then stays mounted across close/reopen.
 */
export function PaletteLabLazy() {
  const open = usePaletteLabOpen();
  const [hasEverOpened, setHasEverOpened] = useState(false);

  useEffect(() => () => setPaletteLabOpen(false), []);

  useEffect(() => {
    if (open) setHasEverOpened(true);
  }, [open]);

  return (
    <>
      <PaletteLabRuntimeMount />
      <SharedThemeInviteMount />
      {hasEverOpened ? <PaletteLabPanel /> : null}
    </>
  );
}
