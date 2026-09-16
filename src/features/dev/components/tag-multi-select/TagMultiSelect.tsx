import { useId } from "react";
import { Icon } from "@/components/common/Icon";
import type { TagOption } from "@/data/config/tagOptions";
import { Button } from "@/components/ui/button";
import { TagMultiSelectMenu } from "./TagMultiSelectMenu";
import { TagMultiSelectSelectedTags } from "./TagMultiSelectSelectedTags";
import { useTagMultiSelectState } from "./useTagMultiSelectState";

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
  compact?: boolean;
  icon?: React.ReactNode;
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
  compact = false,
  icon,
}: TagMultiSelectProps) => {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const labelId = `${inputId}-label`;
  const helperId = `${inputId}-help`;
  const {
    containerRef,
    inputRef,
    query,
    isOpen,
    highlightedIndex,
    normalizedQuery,
    menuItems,
    createOptionLabel,
    helperTextValue,
    shouldShowTriggerButton,
    shouldShowInlineCreateButton,
    shouldShowInlineEmptyState,
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
  } = useTagMultiSelectState({
    value,
    options,
    onChange,
    disabled,
    allowCreate,
    createLabel,
    openStrategy,
  });

  const helper = helperText ?? helperTextValue;
  const computedAddButtonLabel = addButtonLabel ?? `Add ${label}`;

  return (
    <div className={`min-w-0 ${className ?? ""}`} ref={containerRef}>
      <label id={labelId} htmlFor={inputId} className="theme-text-secondary mb-1 flex items-center gap-1.5 text-sm font-medium">
        {icon}
        {label}
      </label>
      <div
        className={`relative rounded-xl border border-[var(--theme-border-subtle)] bg-[var(--theme-field-surface)] px-3 py-2 transition focus-within:border-[var(--theme-text-secondary)] ${
          disabled ? "opacity-60" : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <TagMultiSelectSelectedTags
              value={value}
              compact={compact}
              disabled={disabled}
              onRemoveTag={handleRemoveTag}
            />
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
              className="flex-1 min-w-[8rem] bg-transparent text-[16px] text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-faint)] focus:outline-none md:text-sm"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isOpen}
              aria-haspopup="listbox"
              aria-controls={listboxId}
              aria-describedby={helperId}
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
              type="button"
              variant="pill"
              size="icon"
              onClick={handleTriggerClick}
              aria-label={computedAddButtonLabel}
              disabled={disabled}
            >
              <Icon icon="lucide:plus" size={16} />
            </Button>
          ) : null}
        </div>
        <TagMultiSelectMenu
          listboxId={listboxId}
          labelId={labelId}
          isOpen={isOpen}
          menuItems={menuItems}
          highlightedIndex={highlightedIndex}
          createOptionLabel={createOptionLabel}
          emptyStateText={emptyStateText}
          shouldShowInlineCreateButton={shouldShowInlineCreateButton}
          shouldShowInlineEmptyState={shouldShowInlineEmptyState}
          disabled={disabled}
          onCreate={() => handleAddTag(normalizedQuery)}
          onOptionMouseDown={handleOptionMouseDown}
          onOptionClick={handleOptionClick}
          onHighlight={setHighlightedIndex}
        />
      </div>
      <p id={helperId} className="theme-text-faint mt-2 text-xs">{helper}</p>
    </div>
  );
};
