"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/common/Icon";
import {
  CONTROL_MENU_ITEM_CLASS,
  CONTROL_TRIGGER_CHEVRON_CLASS,
  CONTROL_TRIGGER_CLASS,
  CONTROL_TRIGGER_LABEL_CLASS,
} from "@/components/ui/controlBarTrigger";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { msg, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { ReportSortDirection, ReportSortKey } from "../domain/tripReportIndex";

export const SORT_OPTIONS: {
  id: string;
  key: ReportSortKey;
  direction: ReportSortDirection;
  label: string;
}[] = [
  { id: "name-asc", key: "alphabetical", direction: "asc", label: msg("Groups A to Z") },
  { id: "name-desc", key: "alphabetical", direction: "desc", label: msg("Groups Z to A") },
  { id: "count-desc", key: "count", direction: "desc", label: msg("Most reports first") },
  { id: "count-asc", key: "count", direction: "asc", label: msg("Fewest reports first") },
  { id: "date-desc", key: "date", direction: "desc", label: msg("Newest experience first") },
  { id: "date-asc", key: "date", direction: "asc", label: msg("Oldest experience first") },
];

export const DEFAULT_SORT_ID = "name-asc";

export function SortMenu({
  activeId,
  activeLabel,
  onChange,
}: {
  activeId: string;
  activeLabel: string;
  onChange: (id: string) => void;
}) {
  const t = useT();
  const orderLabel = t(activeLabel);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="pill"
          size="auto"
          className={CONTROL_TRIGGER_CLASS}
          aria-label={t("Sort order, {{order}}", { order: orderLabel })}
          title={t("Sort order, {{order}}", { order: orderLabel })}
        >
          <Icon icon="lucide:arrow-up-down" className="h-4 w-4 shrink-0" aria-hidden />
          <span className={CONTROL_TRIGGER_LABEL_CLASS}>{orderLabel}</span>
          <Icon icon="lucide:chevron-down" className={CONTROL_TRIGGER_CHEVRON_CLASS} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("Sort groups by")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={activeId} onValueChange={onChange}>
          {SORT_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id} className={CONTROL_MENU_ITEM_CLASS}>
              {t(option.label)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SubstanceFilterControl({
  options,
  active,
  onSelect,
  onClear,
}: {
  options: { name: string; count: number }[];
  active: string | null;
  onSelect: (name: string) => void;
  onClear: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions = normalizedQuery
    ? options.filter((option) => option.name.toLowerCase().includes(normalizedQuery))
    : options;
  const highlighted = Math.min(activeIndex, Math.max(visibleOptions.length - 1, 0));

  useEffect(() => {
    listRef.current?.children[highlighted]?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setActiveIndex(0);
    }
  };

  const commit = (name: string) => {
    onSelect(name);
    handleOpenChange(false);
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant={active !== null ? "pillActive" : "pill"}
            size="auto"
            className={CONTROL_TRIGGER_CLASS}
            aria-label={active !== null ? t("Substance filter, {{substance}} active", { substance: active }) : t("Filter by substance")}
            title={active !== null ? t("Substance filter, {{substance}} active", { substance: active }) : t("Filter by substance")}
          >
            <Icon icon="lucide:flask-conical" className="h-4 w-4 shrink-0" aria-hidden />
            <span className={cn(CONTROL_TRIGGER_LABEL_CLASS, "max-w-[9rem] truncate")}>
              {active ?? t("Filter")}
            </span>
            <Icon icon="lucide:chevron-down" className={CONTROL_TRIGGER_CHEVRON_CLASS} aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" collisionPadding={8} className="w-[calc(100vw-1rem)] p-3 sm:w-72">
          <Input
            type="search"
            inputSize="sm"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={visibleOptions.length > 0 ? `${baseId}-option-${highlighted}` : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex(Math.min(highlighted + 1, visibleOptions.length - 1));
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex(Math.max(highlighted - 1, 0));
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const option = visibleOptions[highlighted];
                if (option) commit(option.name);
              }
            }}
            placeholder={t("Search substances")}
            aria-label={t("Search substances")}
          />
          <ul ref={listRef} id={listId} role="listbox" aria-label={t("Substances with reports")} className="mt-2 max-h-[min(50vh,18rem)] overflow-y-auto">
            {visibleOptions.map((option, index) => (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <li
                key={option.name}
                id={`${baseId}-option-${index}`}
                role="option"
                aria-selected={option.name === active}
                onClick={() => commit(option.name)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition",
                  index === highlighted ? "bg-dose-surface-muted" : undefined,
                  option.name === active ? "text-dose-accent-strong font-semibold" : "theme-text-secondary",
                )}
              >
                <span className="truncate">{option.name}</span>
                <span className="theme-text-faint shrink-0 text-xs">{option.count}</span>
              </li>
            ))}
          </ul>
          {visibleOptions.length === 0 ? (
            <p className="theme-text-faint px-1 py-2 text-sm">{t("No substances match.")}</p>
          ) : null}
        </PopoverContent>
      </Popover>
      {active !== null ? (
        <Button
          type="button"
          variant="pill"
          size="auto"
          className="h-10 w-10 shrink-0 justify-center p-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 md:h-9 md:w-9"
          aria-label={t("Clear substance filter, {{substance}}", { substance: active })}
          title={t("Clear substance filter, {{substance}}", { substance: active })}
          onClick={onClear}
        >
          <Icon icon="lucide:x" className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
