"use client";

import { useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { startThemeLabRuntime } from "./themeLabRuntime";
import { setThemeLabLook } from "./themeLabStore";

export function ThemeLabRuntimeMount({ onReady }: { onReady?: (ready: boolean) => void } = {}) {
  const { visualStyle } = useTheme();

  useEffect(() => {
    setThemeLabLook({ visualStyle });
  }, [visualStyle]);

  useEffect(() => {
    const stop = startThemeLabRuntime();
    onReady?.(true);
    return stop;
  }, [onReady]);

  return null;
}
