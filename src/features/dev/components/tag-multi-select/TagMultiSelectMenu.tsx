import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import type { MenuItem } from "./tagMultiSelectUtils";

type TagMultiSelectMenuProps = {
  listboxId: string;
  isOpen: boolean;
  menuItems: MenuItem[];
  highlightedIndex: number | null;
  createOptionLabel: string;
  emptyStateText: string;
  shouldShowInlineCreateButton: boolean;
  shouldShowInlineEmptyState: boolean;
  disabled: boolean;
  openStrategy: "focus" | "button";
  onCreate: () => void;
  onOptionMouseDown: (event: MouseEvent<HTMLButtonElement>) => void;
  onOptionClick: (item: MenuItem) => void;
  onHighlight: (index: number) => void;
};

export function TagMultiSelectMenu({
  listboxId,
  isOpen,
  menuItems,
  highlightedIndex,
  createOptionLabel,
  emptyStateText,
  shouldShowInlineCreateButton,
  shouldShowInlineEmptyState,
  disabled,
  openStrategy,
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
            variant="default"
            className="w-full rounded-lg"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onCreate}
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
          className="theme-select-panel absolute left-0 right-0 z-20 mt-2 max-h-64 overflow-auto rounded-xl border p-2"
        >
          {menuItems.length === 0 ? (
            shouldShowInlineEmptyState ? null : (
              <div className="px-3 py-2 text-sm text-white/50">{emptyStateText}</div>
            )
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
                    className={`flex min-h-11 cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                      isActive ? "bg-white/10 text-white" : "text-white/70"
                    }`}
                  >
                    <span>{createOptionLabel}</span>
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
                  className={`flex min-h-11 cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                    isActive ? "bg-white/10 text-white" : "text-white/70"
                  }`}
                >
                  <span>{item.option.label}</span>
                  {typeof item.option.count === "number" && item.option.count > 0 ? (
                    <span className="text-xs text-white/40">{item.option.count}</span>
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
