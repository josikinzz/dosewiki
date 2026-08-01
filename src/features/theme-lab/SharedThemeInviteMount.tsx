"use client";

import { useEffect, useState } from "react";
import { isEffectIndex } from "@/config/siteFlavor";
import { consumeShareCodeFromLocation, usePendingShare } from "./paletteLabShare";
import { SharedThemeInvite } from "./SharedThemeInvite";

/**
 * The always-on receiving end of a share link.
 *
 * Mounted beside the lab's runtime rather than inside the editor panel, because
 * a share link has to work on a visitor's *first* visit — before they have ever
 * opened the Theme Lab, and on whatever route the link happened to point at.
 * It renders nothing at all until a code is actually offered, so the ordinary
 * visitor pays only this component's mount.
 *
 * Reads `window.location` in an effect rather than through the router's search
 * params hook on purpose: this must not opt every page in the app into dynamic
 * rendering or need a Suspense boundary in the root layout.
 *
 * Effect Index wears a locked skin and never offers the lab, so a share link
 * does nothing there.
 */
export function SharedThemeInviteMount() {
  const [mounted, setMounted] = useState(false);
  const pending = usePendingShare();

  useEffect(() => {
    setMounted(true);
    if (isEffectIndex()) return;
    consumeShareCodeFromLocation();
  }, []);

  // The portal the invite renders through needs a document, and the server has
  // no URL-borne share to report anyway.
  if (!mounted || !pending) return null;
  return <SharedThemeInvite pending={pending} />;
}
