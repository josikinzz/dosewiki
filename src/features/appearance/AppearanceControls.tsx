"use client";

import { useContext, useEffect, useState } from "react";

import { SessionContext } from "next-auth/react";

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { useTheme } from "@/context/ThemeContext";
import { readEditorHint } from "@/lib/auth/editorHint";
import { canAccessDev } from "@/lib/auth/roles";
import { AppearanceCog } from "./AppearanceCog";

export function AppearanceControls({
  className,
  iconSize,
  alignOffset,
  sideOffset,
  allowThemeLab = true,
}: {
  className?: string;
  iconSize?: number;
  alignOffset?: number;
  sideOffset?: number;
  allowThemeLab?: boolean;
}) {
  const { isVisualStyleLocked, isSurfaceLocked, isAccentLocked, isFontLocked } = useTheme();
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
