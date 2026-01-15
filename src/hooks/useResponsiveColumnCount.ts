import { useCallback, useEffect, useState } from "react";

const BREAKPOINTS = {
  sm: 640,
  lg: 1024,
  "2xl": 1536,
};

type ResponsiveColumnOptions = {
  limitColumns?: boolean;
};

export function useResponsiveColumnCount(options?: ResponsiveColumnOptions): number {
  const limitColumns = options?.limitColumns ?? false;
  const maxColumns = limitColumns ? 3 : 4;

  const getColumnCount = useCallback(() => {
    if (typeof window === "undefined") {
      return maxColumns;
    }
    const width = window.innerWidth;
    if (width < BREAKPOINTS.sm) return 1;
    if (width < BREAKPOINTS.lg) return 2;
    if (width < BREAKPOINTS["2xl"]) return 3;
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
