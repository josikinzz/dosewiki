"use client";

import { useCallback, useEffect, useState } from "react";
import { INDEX_PANEL_MIN_COLUMN_WIDTH } from "@/components/common/IndexPanelLayout";

const BREAKPOINTS = {
  sm: 480,
  md: 768,
  lg: 1024,
};

const INDEX_PANEL_HORIZONTAL_PADDING = 32;
const INDEX_PANEL_COLUMN_GAP = 24;

type ResponsiveColumnOptions = {
  limitColumns?: boolean;
  maxColumns?: number;
};

export function useResponsiveColumnCount(options?: ResponsiveColumnOptions): number {
  const limitColumns = options?.limitColumns ?? false;
  const maxColumnsOverride = options?.maxColumns;
  const maxColumns = maxColumnsOverride ?? (limitColumns ? 3 : Number.POSITIVE_INFINITY);

  const getColumnCount = useCallback(() => {
    if (typeof window === "undefined") {
      return Number.isFinite(maxColumns) ? maxColumns : 6;
    }
    const width = window.innerWidth;
    const availableWidth = Math.max(0, width - INDEX_PANEL_HORIZONTAL_PADDING);
    const widthBasedColumns = Math.max(
      1,
      Math.floor((availableWidth + INDEX_PANEL_COLUMN_GAP) / (INDEX_PANEL_MIN_COLUMN_WIDTH + INDEX_PANEL_COLUMN_GAP)),
    );
    const responsiveColumns =
      width < BREAKPOINTS.sm ? 1
      : width < BREAKPOINTS.md ? 2
      : width < BREAKPOINTS.lg ? 3
      : widthBasedColumns;

    return Math.min(responsiveColumns, maxColumns);
  }, [maxColumns]);

  const [columnCount, setColumnCount] = useState(() => (
    Number.isFinite(maxColumns) ? maxColumns : 6
  ));

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
