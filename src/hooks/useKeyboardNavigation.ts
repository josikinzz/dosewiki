import { useCallback } from "react";

interface UseKeyboardNavigationOptions<T> {
  /** Array of items being navigated */
  items: T[];
  /** Currently active/highlighted index */
  activeIndex: number;
  /** Function to update the active index */
  setActiveIndex: (index: number | ((prev: number) => number)) => void;
  /** Called when an item is selected (Enter key with valid selection) */
  onSelect: (item: T) => void;
  /** Called when Enter is pressed without a selection (submit action) */
  onSubmit: () => void;
  /** Called when Escape is pressed */
  onClose: () => void;
  /** Whether navigation is currently enabled (e.g., dropdown is open) */
  enabled: boolean;
  /** Whether Enter should be prevented from selecting (used when panel isn't showing) */
  isShowingPanel?: boolean;
}

interface UseKeyboardNavigationReturn {
  /** Keyboard event handler to attach to input element */
  handleKeyDown: (event: React.KeyboardEvent) => void;
}

/**
 * Hook for accessible keyboard navigation in listbox/combobox components.
 *
 * Implements ARIA listbox keyboard patterns:
 * - Arrow Up/Down: Navigate items with wrapping
 * - Enter: Select highlighted item or submit
 * - Escape: Close dropdown
 *
 * @example
 * ```tsx
 * const { handleKeyDown } = useKeyboardNavigation({
 *   items: suggestions,
 *   activeIndex,
 *   setActiveIndex,
 *   onSelect: handleSelectSuggestion,
 *   onSubmit: handleSearch,
 *   onClose: closeSuggestions,
 *   enabled: showSuggestions,
 * });
 *
 * return (
 *   <input
 *     onKeyDown={handleKeyDown}
 *     aria-activedescendant={activeIndex >= 0 ? `option-${activeIndex}` : undefined}
 *   />
 * );
 * ```
 */
export function useKeyboardNavigation<T>({
  items,
  activeIndex,
  setActiveIndex,
  onSelect,
  onSubmit,
  onClose,
  enabled,
  isShowingPanel = enabled,
}: UseKeyboardNavigationOptions<T>): UseKeyboardNavigationReturn {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!isShowingPanel && items.length > 0) {
          setActiveIndex(0);
          return;
        }
        setActiveIndex((prev) => {
          if (items.length === 0) return -1;
          const next = prev + 1;
          return next >= items.length ? 0 : next;
        });
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!isShowingPanel && items.length > 0) {
          setActiveIndex(items.length - 1);
          return;
        }
        setActiveIndex((prev) => {
          if (items.length === 0) return -1;
          const next = prev - 1;
          return next < 0 ? items.length - 1 : next;
        });
        return;
      }

      if (event.key === "Enter") {
        if (isShowingPanel && activeIndex >= 0 && items[activeIndex]) {
          event.preventDefault();
          onSelect(items[activeIndex]);
          return;
        }
        event.preventDefault();
        onSubmit();
        return;
      }

      if (event.key === "Escape") {
        onClose();
      }
    },
    [
      items,
      activeIndex,
      setActiveIndex,
      onSelect,
      onSubmit,
      onClose,
      isShowingPanel,
    ]
  );

  return { handleKeyDown };
}
