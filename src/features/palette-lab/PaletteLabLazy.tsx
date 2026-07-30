"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { usePaletteLabOpen } from "./paletteLabStore";
import { PaletteLabRuntimeMount } from "./PaletteLabRuntimeMount";

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
      {hasEverOpened ? <PaletteLabPanel /> : null}
    </>
  );
}
