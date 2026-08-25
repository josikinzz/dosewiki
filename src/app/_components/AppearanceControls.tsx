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
 * server-side.
 *
 * `className` lands on the trigger itself because the homepage positions that
 * button directly.
 *
 * `allowThemeLab` is the caller's veto over that drawer, not a second policy: the
 * pre-launch holding page mounts this cog so a visitor can still pick an appearance,
 * but the Lab authors and shares palettes through routes the construction hosts do
 * not serve, so there the drawer is withheld.
 */
export function AppearanceControls({
  className,
  allowThemeLab = true,
}: {
  className?: string;
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
    allowThemeLab && SITE_FLAVOR_CONFIG.flavor === "dosewiki" && (sessionSaysDev || editorHere);

  return (
    <AppearanceCog
      className={className}
      showVisualStyle={!isVisualStyleLocked}
      showColorScheme={SITE_FLAVOR_CONFIG.showColorSchemeToggle}
      showSurface={!isSurfaceLocked}
      showAccent={!isAccentLocked}
      showFont={!isFontLocked}
      showMoreSettings={hasThemeLab}
    />
  );
}
