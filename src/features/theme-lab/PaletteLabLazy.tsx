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
 * The lab's mount: the UI-free runtime always, the editor once it has been
 * opened.
 *
 * Mounted by the protected `/dev/themes` route and by nothing else — no public
 * page carries the runtime, the share receiver, or the editor chunk. The route
 * owns the open state (it opens the editor on entry); this component only
 * releases it again, so returning later starts from a known state instead of
 * whatever the last session left behind.
 *
 * The split still earns its keep inside the route: the runtime restores and
 * persists the saved palette, while the heavy editor chunk loads on the first
 * open and stays mounted across close and reopen.
 *
 * The share-link receiver sits beside the runtime rather than inside the panel:
 * a link a colleague sent has to work on the first load of this route, before
 * the editor chunk exists.
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
