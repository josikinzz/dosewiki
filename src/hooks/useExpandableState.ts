import { useState, useCallback, useMemo } from "react";

interface UseExpandableStateOptions {
  /** If true, all initialKeys start expanded */
  defaultExpanded?: boolean;
  /** Keys to initialize as expanded (when defaultExpanded is true) */
  initialKeys?: string[];
}

interface UseExpandableStateReturn {
  /** The Set of currently expanded IDs */
  expandedIds: Set<string>;
  /** Check if a key is expanded */
  isExpanded: (key: string) => boolean;
  /** Toggle a key's expanded state */
  toggle: (key: string) => void;
  /** Expand a specific key */
  expand: (key: string) => void;
  /** Collapse a specific key */
  collapse: (key: string) => void;
  /** Expand all provided keys */
  expandAll: (keys: string[]) => void;
  /** Collapse all keys */
  collapseAll: () => void;
}

/**
 * Hook for managing expand/collapse state across multiple items.
 *
 * @example
 * ```tsx
 * const { isExpanded, toggle } = useExpandableState();
 *
 * return items.map(item => (
 *   <div key={item.id}>
 *     <button onClick={() => toggle(item.id)}>
 *       {isExpanded(item.id) ? 'Collapse' : 'Expand'}
 *     </button>
 *     {isExpanded(item.id) && <Content />}
 *   </div>
 * ));
 * ```
 */
export function useExpandableState(
  options: UseExpandableStateOptions = {}
): UseExpandableStateReturn {
  const { defaultExpanded = false, initialKeys = [] } = options;

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    if (defaultExpanded && initialKeys.length > 0) {
      return new Set(initialKeys);
    }
    return new Set();
  });

  const isExpanded = useCallback(
    (key: string) => expandedIds.has(key),
    [expandedIds]
  );

  const toggle = useCallback((key: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const expand = useCallback((key: string) => {
    setExpandedIds((prev) => new Set(prev).add(key));
  }, []);

  const collapse = useCallback((key: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const expandAll = useCallback((keys: string[]) => {
    setExpandedIds(new Set(keys));
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  return useMemo(
    () => ({
      expandedIds,
      isExpanded,
      toggle,
      expand,
      collapse,
      expandAll,
      collapseAll,
    }),
    [expandedIds, isExpanded, toggle, expand, collapse, expandAll, collapseAll]
  );
}
