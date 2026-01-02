import { Plus, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import type { TagOption } from "../../data/tagOptions";
import { Button } from "@/components/ui/button";

const collapseWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();
const toComparable = (value: string): string => collapseWhitespace(value).toLowerCase();

const isLowercaseOnly = (value: string): boolean => /^(?:[a-z0-9\s\-_,.]+)$/u.test(value) && /[a-z]/.test(value);

const normalizeTagLabel = (raw: string): string | null => {
  const collapsed = collapseWhitespace(raw);
  if (!collapsed) {
    return null;
  }

  if (isLowercaseOnly(collapsed)) {
    return collapsed
      .split(" ")
      .map((segment) => (segment.length > 0 ? segment[0].toUpperCase() + segment.slice(1) : segment))
      .join(" ");
  }

  return collapsed;
};

export type TagMultiSelectProps = {
  label: string;
  helperText?: string;
  placeholder?: string;
  value: string[];
  options: TagOption[];
  onChange: (next: string[]) => void;
  createLabel?: (query: string) => string;
  emptyStateText?: string;
  inputName?: string;
  disabled?: boolean;
  allowCreate?: boolean;
  className?: string;
  addButtonLabel?: string;
  openStrategy?: "focus" | "button";
};

type MenuItem =
  | {
      type: "option";
      option: TagOption;
    }
  | {
      type: "create";
    };

const getSubstringPriority = (labelLower: string, queryLower: string): number => {
  if (labelLower === queryLower) {
    return 0;
  }
  if (labelLower.startsWith(queryLower)) {
    return 1;
  }
  if (labelLower.includes(queryLower)) {
    return 2;
  }
  return 3;
};

export const TagMultiSelect = ({
  label,
  helperText,
  placeholder,
  value,
  options,
  onChange,
  createLabel,
  emptyStateText = "No matching tags",
  inputName,
  disabled = false,
  allowCreate = true,
  className,
  addButtonLabel,
  openStrategy = "focus",
}: TagMultiSelectProps) => {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
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
      const aLabel = a.label.toLowerCase();
      const bLabel = b.label.toLowerCase();
      const aPriority = getSubstringPriority(aLabel, normalizedQueryKey);
      const bPriority = getSubstringPriority(bLabel, normalizedQueryKey);
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      return a.label.localeCompare(b.label);
    });
  }, [normalizedQuery, normalizedQueryKey, options, selectedKeys]);

  const hasCreateOption = allowCreate && normalizedQuery.length > 0 && !selectedKeys.has(normalizedQueryKey) && !optionLookup.has(normalizedQueryKey);

  const includeCreateInMenu = openStrategy === "focus";

  const menuItems: MenuItem[] = useMemo(() => {
    const items: MenuItem[] = filteredOptions.map((option) => ({ type: "option", option }));
    if (includeCreateInMenu && hasCreateOption) {
      items.push({ type: "create" });
    }
    return items;
  }, [filteredOptions, hasCreateOption, includeCreateInMenu]);

  useEffect(() => {
    if (!isOpen) {
      setHighlightedIndex(null);
      return;
    }

    if (menuItems.length === 0) {
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
      if (!containerRef.current) {
        return;
      }
      if (!containerRef.current.contains(document.activeElement)) {
        setIsOpen(false);
        setHighlightedIndex(null);
      }
    });
  }, []);

  const handleInputFocus = useCallback(() => {
    if (disabled) {
      return;
    }
    if (openStrategy === "focus") {
      setIsOpen(true);
    }
  }, [disabled, openStrategy]);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (disabled) {
        return;
      }
      setQuery(event.target.value);
      setIsOpen(true);
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
    if (!isOpen) {
      if (hasCreateOption) {
        handleAddTag(normalizedQuery);
      }
      return;
    }
    if (highlightedIndex === null || highlightedIndex < 0 || highlightedIndex >= menuItems.length) {
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
          const next = current === null ? 0 : (current + 1) % menuItems.length;
          return next;
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
          const next = current === null ? menuItems.length - 1 : (current + menuItems.length - 1) % menuItems.length;
          return next;
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

  const handleOptionMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
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
    if (createLabel) {
      return createLabel(normalizedQuery);
    }
    return `Create "${normalizedQuery}"`;
  }, [createLabel, normalizedQuery]);

  const renderMenuItem = (item: MenuItem, index: number) => {
    const isActive = highlightedIndex === index;
    const itemId = `${listboxId}-item-${index}`;

    if (item.type === "create") {
      return (
        <div
          key={itemId}
          id={itemId}
          role="option"
          aria-selected={isActive}
          onMouseDown={handleOptionMouseDown}
          onMouseEnter={() => setHighlightedIndex(index)}
          onClick={() => handleOptionClick(item)}
          className={`flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm transition hover:bg-white/10 ${
            isActive ? "bg-white/10 text-white" : "text-white/70"
          }`}
        >
          <span>{createOptionLabel}</span>
        </div>
      );
    }

    const { option } = item;
    return (
      <div
        key={itemId}
        id={itemId}
        role="option"
        aria-selected={isActive}
        onMouseDown={handleOptionMouseDown}
        onMouseEnter={() => setHighlightedIndex(index)}
        onClick={() => handleOptionClick(item)}
        className={`flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm transition hover:bg-white/10 ${
          isActive ? "bg-white/10 text-white" : "text-white/70"
        }`}
      >
        <span>{option.label}</span>
        {typeof option.count === "number" && option.count > 0 ? (
          <span className="text-xs text-white/40">{option.count}</span>
        ) : null}
      </div>
    );
  };

  const helper = helperText ?? `${allowCreate ? "Search existing tags or press Enter to add." : "Search and select tags."}`;
  const shouldShowTriggerButton = openStrategy === "button";
  const computedAddButtonLabel = addButtonLabel ?? `Add ${label}`;
  const shouldShowInlineCreateButton = openStrategy === "button" && hasCreateOption && allowCreate;
  const shouldShowInlineEmptyState = openStrategy === "button" && normalizedQuery.length > 0 && filteredOptions.length === 0;

  return (
    <div className={className} ref={containerRef}>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-white/80">
        {label}
      </label>
      <div
        className={`relative rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 transition focus-within:border-white/20 focus-within:bg-slate-900/60 ${
          disabled ? "opacity-60" : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {value.map((tag, index) => {
              const handleRemoveClick = (event: MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                event.preventDefault();
                handleRemoveTag(index);
              };
              return (
                <span
                  key={`${tag}-${index}`}
                  className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-xs text-white/80"
                >
                  {tag}
                  {!disabled ? (
                    <Button
                      variant="tagRemove"
                      aria-label={`Remove ${tag}`}
                      onClick={handleRemoveClick}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  ) : null}
                </span>
              );
            })}
            <input
              id={inputId}
              ref={inputRef}
              type="text"
              name={inputName}
              value={query}
              placeholder={value.length === 0 ? placeholder : undefined}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              onBlur={handleInputBlur}
              onFocus={handleInputFocus}
              className="flex-1 min-w-[8rem] bg-transparent text-[16px] text-white focus:outline-none md:text-sm"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isOpen}
              aria-haspopup="listbox"
              aria-controls={listboxId}
              aria-activedescendant={
                isOpen && highlightedIndex !== null && highlightedIndex >= 0 && highlightedIndex < menuItems.length
                  ? `${listboxId}-item-${highlightedIndex}`
                  : undefined
              }
              disabled={disabled}
              autoComplete="off"
            />
          </div>
          {shouldShowTriggerButton ? (
            <Button
              variant="pill"
              size="icon"
              className="h-9 w-9"
              onClick={handleTriggerClick}
              aria-label={computedAddButtonLabel}
              disabled={disabled}
            >
              <Plus className="h-4 w-4" aria-hidden="true" focusable="false" />
            </Button>
          ) : null}
        </div>
        {shouldShowInlineCreateButton ? (
          <div className="mt-3">
            <Button
              variant="default"
              className="w-full rounded-lg"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleAddTag(normalizedQuery)}
              disabled={disabled}
            >
              {createOptionLabel}
            </Button>
          </div>
        ) : null}
        {shouldShowInlineEmptyState ? (
          <p className={`${shouldShowInlineCreateButton ? "mt-2" : "mt-3"} text-xs text-white/50`}>
            {emptyStateText}
          </p>
        ) : null}
        {isOpen && (openStrategy !== "button" || menuItems.length > 0) ? (
          <div
            id={listboxId}
            role="listbox"
            aria-multiselectable="true"
            className="absolute left-0 right-0 z-20 mt-2 max-h-64 overflow-auto rounded-xl border border-white/10 bg-[#120d27] p-2 shadow-xl"
          >
            {menuItems.length === 0 ? (
              shouldShowInlineEmptyState ? null : (
                <div className="px-3 py-2 text-sm text-white/50">{emptyStateText}</div>
              )
            ) : (
              menuItems.map((item, index) => renderMenuItem(item, index))
            )}
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-white/50">{helper}</p>
    </div>
  );
};
