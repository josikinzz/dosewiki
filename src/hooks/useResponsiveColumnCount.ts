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
    const responsiveColumns =
      width < BREAKPOINTS.sm ? 1
      : width < BREAKPOINTS.md ? 2
      : width < BREAKPOINTS.lg ? 3
      : width < BREAKPOINTS.xl ? 4
      : width < BREAKPOINTS["2xl"] ? 5
      : 6;

    return Math.min(responsiveColumns, maxColumns);
  }, [maxColumns]);

  const [columnCount, setColumnCount] = useState(maxColumns);

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
