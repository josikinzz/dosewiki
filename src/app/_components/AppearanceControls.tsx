"use client";

import { useContext, useEffect, useState } from "react";

import { SessionContext } from "next-auth/react";

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { useTheme } from "@/context/ThemeContext";
import { readEditorHint } from "@/lib/auth/editorHint";
import { canAccessDev } from "@/lib/auth/roles";
import { AppearanceCog } from "./AppearanceCog";

/**
 * Resolves publication policy for the appearance axes.
 * The Theme Lab drawer is a dev tool: its entry appears only for a dev-capable
 * session, or when this browser carries a fresh editor hint — written by
 * `providers.tsx` when such a session mounts a provider-backed page, retracted
 * on sign-out or a lesser sign-in, and validated rather than trusted (see
 * `src/lib/auth/editorHint.ts`). Most pages mount no session provider, which is
 * why the hint exists; the session context is consulted directly where it does
 * exist so a dev's first provider-backed page needs no second mount. The hint
 * is read after hydration so the server and first client markup agree. This is
 * presentation, not a security boundary — the Lab's own routes stay gated
 * server-side. A local `next dev` server skips the gate: `NODE_ENV` is
 * "development" only there, so the entry is unconditional on a dev's own
 * machine and unchanged on any deployment.
 *
 * `className` lands on the trigger itself, with no wrapper, so a caller positioning the
 * button directly never fights an intermediate box for the offset.
 * `iconSize` changes only the glyph; the trigger keeps its 44px hit target.
 *
 * `allowThemeLab` is the caller's veto over that drawer, not a second policy. The retained
 * holding surface lets a visitor choose an appearance while deliberately withholding
 * authoring and sharing controls.
 */
export function AppearanceControls({
  className,
  iconSize,
  alignOffset,
  sideOffset,
  allowThemeLab = true,
}: {
  className?: string;
  iconSize?: number;
  /**
   * Shift along the popover's alignment axis, straight through to the content. The
   * mobile header mount lands the panel on the corner inset the mobile nav sheet
   * reaches; the desktop mount leaves it anchored to the trigger.
   */
  alignOffset?: number;
  /** Shift away from the trigger along the side axis, straight through. */
  sideOffset?: number;
  allowThemeLab?: boolean;
}) {
  const { isVisualStyleLocked, isSurfaceLocked, isAccentLocked, isFontLocked } = useTheme();
  // Undefined on the many pages that mount no SessionProvider; the hint covers those.
  const session = useContext(SessionContext);
  const sessionSaysDev =
    session?.status === "authenticated" && canAccessDev(session.data?.user?.role);
  const [editorHere, setEditorHere] = useState(false);

  useEffect(() => {
    setEditorHere(readEditorHint());
  }, []);

  const hasThemeLab =
    allowThemeLab &&
    SITE_FLAVOR_CONFIG.flavor === "dosewiki" &&
    // A local `next dev` server is a dev's own machine: the entry is the point of
    // running one, so it needs no session or hint there. Deployed builds (including
    // preview deployments) keep the session/hint gate below.
    (process.env.NODE_ENV === "development" || sessionSaysDev || editorHere);

  return (
    <AppearanceCog
      className={className}
      iconSize={iconSize}
      alignOffset={alignOffset}
      sideOffset={sideOffset}
      showVisualStyle={!isVisualStyleLocked}
      showColorScheme={SITE_FLAVOR_CONFIG.showColorSchemeToggle}
      showSurface={!isSurfaceLocked}
      showAccent={!isAccentLocked}
      showFont={!isFontLocked}
      showMoreSettings={hasThemeLab}
    />
  );
}
