"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { usePaletteLabOpen } from "./paletteLabStore";
import { PaletteLabRuntimeMount } from "./PaletteLabRuntimeMount";
import { SharedThemeInviteMount } from "./SharedThemeInviteMount";

const PaletteLabPanel = dynamic(() => import("./PaletteLab").then((module) => module.PaletteLab), {
  ssr: false,
});

/**
 * The lab's global mount: the UI-free runtime always, the editor only once it
 * has been opened.
 *
 * The split is the point. The runtime restores and persists the visitor's saved
 * theme on every load; the heavy editor chunk still waits for a trigger click,
 * and once loaded stays mounted across close/reopen and navigation.
 *
 * The share-link receiver joins the runtime on the always-mounted side: a link
 * a stranger sent has to work on a first visit, before the editor exists.
 */
export function PaletteLabLazy() {
  const open = usePaletteLabOpen();
  const [hasEverOpened, setHasEverOpened] = useState(false);

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
