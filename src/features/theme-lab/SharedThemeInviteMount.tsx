"use client";

import { useEffect, useState } from "react";
import { consumeShareCodeFromLocation, usePendingShare } from "./paletteLabShare";
import { SharedThemeInvite } from "./SharedThemeInvite";

/**
 * The receiving end of a share link, mounted beside the global lab runtime
 * rather than inside the editor panel. A shared palette has to be offered on
 * first load, before the editor chunk exists. It renders nothing until a code
 * is actually offered.
 *
 * Reads `window.location` in an effect rather than through the router's search
 * params hook on purpose: this must not opt the route into dynamic rendering
 * for the sake of a query parameter that is usually absent.
 */
export function SharedThemeInviteMount() {
  const [mounted, setMounted] = useState(false);
  const pending = usePendingShare();

  useEffect(() => {
    setMounted(true);
    consumeShareCodeFromLocation();
  }, []);

  // The portal the invite renders through needs a document, and the server has
  // no URL-borne share to report anyway.
  if (!mounted || !pending) return null;
  return <SharedThemeInvite pending={pending} />;
}
