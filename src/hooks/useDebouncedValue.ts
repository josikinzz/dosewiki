import { useEffect, useState } from "react";

/**
 * Debounce a value by the specified delay.
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds
 * @returns The debounced value
 *
 * @example
 * ```tsx
 * const [query, setQuery] = useState("");
 * const debouncedQuery = useDebouncedValue(query, 300);
 *
 * useEffect(() => {
 *   // This effect only runs after 300ms of no changes
 *   performSearch(debouncedQuery);
 * }, [debouncedQuery]);
 * ```
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
