"use client";

import { useCallback, useEffect, useState } from "react";

const BREAKPOINTS = {
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

type ResponsiveColumnOptions = {
  limitColumns?: boolean;
  maxColumns?: number;
};

export function useResponsiveColumnCount(options?: ResponsiveColumnOptions): number {
  const limitColumns = options?.limitColumns ?? false;
  const maxColumnsOverride = options?.maxColumns;
  const maxColumns = maxColumnsOverride ?? (limitColumns ? 3 : 6);

  const getColumnCount = useCallback(() => {
    if (typeof window === "undefined") {
      return maxColumns;
    }
    const width = window.innerWidth;
    if (width < BREAKPOINTS.sm) return 1;
    if (width < BREAKPOINTS.md) return 2;
    if (width < BREAKPOINTS.lg) return 3;
    if (width < BREAKPOINTS.xl) return 4;
    if (width < BREAKPOINTS["2xl"]) return 5;
    return maxColumns;
  }, [maxColumns]);

  const [columnCount, setColumnCount] = useState(getColumnCount);

  useEffect(() => {
    const handleResize = () => {
      setColumnCount(getColumnCount());
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, [getColumnCount]);

  return columnCount;
}
