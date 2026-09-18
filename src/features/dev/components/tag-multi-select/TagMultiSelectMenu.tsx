import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import type { MenuItem } from "./tagMultiSelectUtils";

type TagMultiSelectMenuProps = {
  listboxId: string;
  labelId: string;
  isOpen: boolean;
  menuItems: MenuItem[];
  highlightedIndex: number | null;
  createOptionLabel: string;
  emptyStateText: string;
  shouldShowInlineCreateButton: boolean;
  shouldShowInlineEmptyState: boolean;
  disabled: boolean;
  onCreate: () => void;
  onOptionMouseDown: (event: MouseEvent<HTMLButtonElement>) => void;
  onOptionClick: (item: MenuItem) => void;
  onHighlight: (index: number) => void;
};

export function TagMultiSelectMenu({
  listboxId,
  labelId,
  isOpen,
  menuItems,
  highlightedIndex,
  createOptionLabel,
  emptyStateText,
  shouldShowInlineCreateButton,
  shouldShowInlineEmptyState,
  disabled,
  onCreate,
  onOptionMouseDown,
  onOptionClick,
  onHighlight,
}: TagMultiSelectMenuProps) {
  return (
    <>
      {shouldShowInlineCreateButton ? (
        <div className="mt-3">
          <Button
            type="button"
            variant="default"
            className="h-auto min-h-10 w-full whitespace-normal rounded-lg [overflow-wrap:anywhere]"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onCreate}
            disabled={disabled}
          >
            {createOptionLabel}
          </Button>
        </div>
      ) : null}
      {shouldShowInlineEmptyState && !isOpen ? (
        <p className={`${shouldShowInlineCreateButton ? "mt-2" : "mt-3"} theme-text-faint text-xs`}>
          {emptyStateText}
        </p>
      ) : null}
      {isOpen ? (
        <div
          id={listboxId}
          role="listbox"
          aria-labelledby={labelId}
          aria-multiselectable="true"
          className="theme-select-panel absolute left-0 right-0 z-20 mt-2 max-h-64 overflow-auto rounded-xl border p-2"
        >
          {menuItems.length === 0 ? (
            <div role="status" className="theme-text-faint px-3 py-2 text-sm">{emptyStateText}</div>
          ) : (
            menuItems.map((item, index) => {
              const isActive = highlightedIndex === index;
              const itemId = `${listboxId}-item-${index}`;

              if (item.type === "create") {
                return (
                  <button
                    type="button"
                    key={itemId}
                    id={itemId}
                    role="option"
                    aria-selected={isActive}
                    onMouseDown={onOptionMouseDown}
                    onMouseEnter={() => onHighlight(index)}
                    onClick={() => onOptionClick(item)}
                    className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm [overflow-wrap:anywhere] transition hover:[background:var(--theme-frosted-control-on-panel-hover-bg)] theme-focus-ring ${
                      isActive
                        ? "[background:var(--theme-frosted-control-on-panel-hover-bg)] text-[var(--theme-text-primary)]"
                        : "text-[var(--theme-text-secondary)]"
                    }`}
                  >
                    <span className="min-w-0">{createOptionLabel}</span>
                  </button>
                );
              }

              return (
                <button
                  type="button"
                  key={itemId}
                  id={itemId}
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={onOptionMouseDown}
                  onMouseEnter={() => onHighlight(index)}
                  onClick={() => onOptionClick(item)}
                  className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm [overflow-wrap:anywhere] transition hover:[background:var(--theme-frosted-control-on-panel-hover-bg)] theme-focus-ring ${
                    isActive
                      ? "[background:var(--theme-frosted-control-on-panel-hover-bg)] text-[var(--theme-text-primary)]"
                      : "text-[var(--theme-text-secondary)]"
                  }`}
                >
                  <span className="min-w-0">{item.option.label}</span>
                  {typeof item.option.count === "number" && item.option.count > 0 ? (
                    <span className="theme-text-faint shrink-0 text-xs">{item.option.count}</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </>
  );
}
