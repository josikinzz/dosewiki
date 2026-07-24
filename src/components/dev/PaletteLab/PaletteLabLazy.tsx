"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { usePaletteLabOpen } from "./paletteLabStore";

const PaletteLabPanel = dynamic(() => import("./PaletteLab").then((module) => module.PaletteLab), {
  ssr: false,
});

/**
 * Keeps the global Palette Lab available without loading its editor until it is
 * actually opened. Once loaded, the panel remains mounted across close/reopen
 * and navigation so its state behaves exactly like the original global mount.
 */
export function PaletteLabLazy() {
  const open = usePaletteLabOpen();
  const [hasEverOpened, setHasEverOpened] = useState(false);

  useEffect(() => {
    if (open) setHasEverOpened(true);
  }, [open]);

  return hasEverOpened ? <PaletteLabPanel /> : null;
}
