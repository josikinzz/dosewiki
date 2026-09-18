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
import { SORT_OPTIONS } from "../domain/reportBrowsePage";

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
          className={cn(CONTROL_TRIGGER_CLASS, "group/report-control transition-colors duration-160 data-[state=open]:bg-dose-surface-muted motion-reduce:transition-none md:w-[11.5rem] md:[@media(pointer:coarse)]:w-[11.5rem]")}
          aria-label={t("Sort order, {{order}}", { order: orderLabel })}
          title={t("Sort order, {{order}}", { order: orderLabel })}
        >
          <Icon icon="lucide:arrow-up-down" className="h-4 w-4 shrink-0" aria-hidden />
          <span className={cn(CONTROL_TRIGGER_LABEL_CLASS, "min-w-0 flex-1 truncate")}>{orderLabel}</span>
          <Icon icon="lucide:chevron-down" className={cn(CONTROL_TRIGGER_CHEVRON_CLASS, "transition-transform duration-160 group-data-[state=open]/report-control:rotate-180 motion-reduce:transition-none")} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("Sort groups by")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={activeId} onValueChange={onChange}>
          {SORT_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id} className={cn(CONTROL_MENU_ITEM_CLASS, "transition-colors duration-160 data-[state=checked]:bg-dose-surface-muted data-[state=checked]:text-dose-accent-strong motion-reduce:transition-none")}>
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
  const triggerRef = useRef<HTMLButtonElement>(null);
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
            ref={triggerRef}
            type="button"
            variant={active !== null ? "pillActive" : "pill"}
            size="auto"
            className={cn(CONTROL_TRIGGER_CLASS, "group/report-control transition-colors duration-160 data-[state=open]:[background:var(--theme-surface-muted)] motion-reduce:transition-none md:w-[10.5rem] md:[@media(pointer:coarse)]:w-[10.5rem]")}
            aria-label={active !== null ? t("Substance filter, {{substance}} active", { substance: active }) : t("Filter by substance")}
            title={active !== null ? t("Substance filter, {{substance}} active", { substance: active }) : t("Filter by substance")}
          >
            <Icon icon="lucide:flask-conical" className="h-4 w-4 shrink-0" aria-hidden />
            <span className={cn(CONTROL_TRIGGER_LABEL_CLASS, "min-w-0 flex-1 truncate")}>
              {active ?? t("Filter")}
            </span>
            <Icon icon="lucide:chevron-down" className={cn(CONTROL_TRIGGER_CHEVRON_CLASS, "transition-transform duration-160 group-data-[state=open]/report-control:rotate-180 motion-reduce:transition-none")} aria-hidden />
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
                  "flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-160 motion-reduce:transition-none",
                  index === highlighted ? "bg-dose-surface-muted" : undefined,
                  option.name === active ? "text-dose-accent-strong font-semibold" : "theme-text-secondary",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{option.name}</span>
                <span className="theme-text-faint shrink-0 text-xs tabular-nums">{option.count}</span>
                <Icon icon="lucide:check" className={cn("h-4 w-4 shrink-0 text-dose-accent-strong transition-opacity duration-160 motion-reduce:transition-none", option.name === active ? "opacity-100" : "opacity-0")} aria-hidden />
              </li>
            ))}
          </ul>
          {visibleOptions.length === 0 ? (
            <p className="theme-text-faint px-1 py-2 text-sm">{t("No substances match.")}</p>
          ) : null}
        </PopoverContent>
      </Popover>
      <div className="h-10 w-10 shrink-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 md:h-9 md:w-9">
      {active !== null ? (
        <Button
          type="button"
          variant="pill"
          size="auto"
          className="theme-feedback-enter h-full w-full justify-center p-0"
          aria-label={t("Clear substance filter, {{substance}}", { substance: active })}
          title={t("Clear substance filter, {{substance}}", { substance: active })}
          onClick={() => {
            onClear();
            triggerRef.current?.focus();
          }}
        >
          <Icon icon="lucide:x" className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
      </div>
    </div>
  );
}
