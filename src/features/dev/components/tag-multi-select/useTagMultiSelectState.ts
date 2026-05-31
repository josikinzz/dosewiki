import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { TagOption } from "@/data/config/tagOptions";
import {
  collapseWhitespace,
  getSubstringPriority,
  normalizeTagLabel,
  toComparable,
  type MenuItem,
} from "./tagMultiSelectUtils";

type UseTagMultiSelectStateArgs = {
  value: string[];
  options: TagOption[];
  onChange: (next: string[]) => void;
  disabled: boolean;
  allowCreate: boolean;
  createLabel?: (query: string) => string;
  openStrategy: "focus" | "button";
};

export function useTagMultiSelectState({
  value,
  options,
  onChange,
  disabled,
  allowCreate,
  createLabel,
  openStrategy,
}: UseTagMultiSelectStateArgs) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);

  const normalizedQuery = collapseWhitespace(query);
  const normalizedQueryKey = normalizedQuery.toLowerCase();

  const optionLookup = useMemo(() => {
    const map = new Map<string, TagOption>();
    options.forEach((option) => {
      const labelKey = toComparable(option.label);
      if (labelKey && !map.has(labelKey)) {
        map.set(labelKey, option);
      }
      const valueKey = toComparable(option.value);
      if (valueKey && !map.has(valueKey)) {
        map.set(valueKey, option);
      }
    });
    return map;
  }, [options]);

  const selectedKeys = useMemo(() => {
    const set = new Set<string>();
    value.forEach((entry) => {
      const key = toComparable(entry);
      if (key) {
        set.add(key);
      }
    });
    return set;
  }, [value]);

  const filteredOptions = useMemo(() => {
    const matches = options.filter((option) => {
      const optionKey = toComparable(option.label);
      if (!optionKey || selectedKeys.has(optionKey)) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return option.label.toLowerCase().includes(normalizedQueryKey);
    });

    if (!normalizedQuery) {
      return matches.sort((a, b) => a.label.localeCompare(b.label));
    }

    return matches.sort((a, b) => {
      const aPriority = getSubstringPriority(a.label.toLowerCase(), normalizedQueryKey);
      const bPriority = getSubstringPriority(b.label.toLowerCase(), normalizedQueryKey);
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      return a.label.localeCompare(b.label);
    });
  }, [normalizedQuery, normalizedQueryKey, options, selectedKeys]);

  const hasCreateOption =
    allowCreate
    && normalizedQuery.length > 0
    && !selectedKeys.has(normalizedQueryKey)
    && !optionLookup.has(normalizedQueryKey);

  const menuItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = filteredOptions.map((option) => ({ type: "option", option }));
    if (openStrategy === "focus" && hasCreateOption) {
      items.push({ type: "create" });
    }
    return items;
  }, [filteredOptions, hasCreateOption, openStrategy]);

  useEffect(() => {
    if (!isOpen || menuItems.length === 0) {
      setHighlightedIndex(null);
      return;
    }

    setHighlightedIndex((current) => {
      if (current === null || current >= menuItems.length) {
        return 0;
      }
      return current;
    });
  }, [isOpen, menuItems]);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  const resolveTagLabel = useCallback(
    (raw: string): string | null => {
      const normalized = normalizeTagLabel(raw);
      if (!normalized) {
        return null;
      }
      const lookup = optionLookup.get(toComparable(normalized));
      return lookup?.label ?? normalized;
    },
    [optionLookup],
  );

  const handleAddTag = useCallback(
    (raw: string, { keepOpen }: { keepOpen?: boolean } = {}) => {
      if (disabled) {
        return;
      }
      const resolved = resolveTagLabel(raw);
      if (!resolved) {
        return;
      }

      const key = toComparable(resolved);
      if (value.some((entry) => toComparable(entry) === key)) {
        setQuery("");
        setHighlightedIndex(null);
        setIsOpen(false);
        return;
      }

      onChange([...value, resolved]);
      setQuery("");
      setHighlightedIndex(null);
      if (keepOpen || openStrategy === "focus") {
        setIsOpen(true);
        focusInput();
      } else {
        setIsOpen(false);
      }
    },
    [disabled, focusInput, onChange, openStrategy, resolveTagLabel, value],
  );

  const handleRemoveTag = useCallback(
    (index: number) => {
      if (disabled) {
        return;
      }
      onChange(value.filter((_, tagIndex) => tagIndex !== index));
      focusInput();
      setIsOpen(true);
    },
    [disabled, focusInput, onChange, value],
  );

  const handleInputBlur = useCallback(() => {
    requestAnimationFrame(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setIsOpen(false);
        setHighlightedIndex(null);
      }
    });
  }, []);

  const handleInputFocus = useCallback(() => {
    if (!disabled && openStrategy === "focus") {
      setIsOpen(true);
    }
  }, [disabled, openStrategy]);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (!disabled) {
        setQuery(event.target.value);
        setIsOpen(true);
      }
    },
    [disabled],
  );

  const handleTriggerClick = useCallback(() => {
    if (disabled) {
      return;
    }

    if (isOpen) {
      setIsOpen(false);
      setHighlightedIndex(null);
      setQuery("");
      return;
    }

    setQuery("");
    setHighlightedIndex(null);
    setIsOpen(true);
    focusInput();
  }, [disabled, focusInput, isOpen]);

  const commitHighlightedItem = useCallback(() => {
    if (!isOpen || highlightedIndex === null || highlightedIndex < 0 || highlightedIndex >= menuItems.length) {
      if (hasCreateOption) {
        handleAddTag(normalizedQuery);
      }
      return;
    }

    const item = menuItems[highlightedIndex];
    if (item.type === "option") {
      handleAddTag(item.option.label);
    } else if (hasCreateOption) {
      handleAddTag(normalizedQuery);
    }
  }, [handleAddTag, hasCreateOption, highlightedIndex, isOpen, menuItems, normalizedQuery]);

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (disabled) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          return;
        }
        setHighlightedIndex((current) => {
          if (menuItems.length === 0) {
            return null;
          }
          return current === null ? 0 : (current + 1) % menuItems.length;
        });
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          return;
        }
        setHighlightedIndex((current) => {
          if (menuItems.length === 0) {
            return null;
          }
          return current === null ? menuItems.length - 1 : (current + menuItems.length - 1) % menuItems.length;
        });
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        commitHighlightedItem();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(null);
        return;
      }

      if (event.key === "Backspace" && normalizedQuery.length === 0 && value.length > 0) {
        event.preventDefault();
        handleRemoveTag(value.length - 1);
      }
    },
    [commitHighlightedItem, disabled, handleRemoveTag, isOpen, menuItems.length, normalizedQuery.length, value.length],
  );

  const handleOptionMouseDown = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  }, []);

  const handleOptionClick = useCallback(
    (item: MenuItem) => {
      if (item.type === "option") {
        handleAddTag(item.option.label, { keepOpen: true });
      } else if (hasCreateOption) {
        handleAddTag(normalizedQuery);
      }
    },
    [handleAddTag, hasCreateOption, normalizedQuery],
  );

  const createOptionLabel = useMemo(() => {
    if (!normalizedQuery) {
      return "";
    }
    return createLabel ? createLabel(normalizedQuery) : `Create "${normalizedQuery}"`;
  }, [createLabel, normalizedQuery]);

  return {
    containerRef,
    inputRef,
    query,
    isOpen,
    highlightedIndex,
    normalizedQuery,
    menuItems,
    createOptionLabel,
    helperTextValue: allowCreate ? "Search existing tags or press Enter to add." : "Search and select tags.",
    shouldShowTriggerButton: openStrategy === "button",
    shouldShowInlineCreateButton: openStrategy === "button" && hasCreateOption && allowCreate,
    shouldShowInlineEmptyState: openStrategy === "button" && normalizedQuery.length > 0 && filteredOptions.length === 0,
    setHighlightedIndex,
    handleAddTag,
    handleRemoveTag,
    handleInputBlur,
    handleInputFocus,
    handleInputChange,
    handleTriggerClick,
    handleInputKeyDown,
    handleOptionMouseDown,
    handleOptionClick,
  };
}
