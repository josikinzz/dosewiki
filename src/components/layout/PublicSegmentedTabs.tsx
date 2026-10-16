"use client";

import { Fragment, useRef, type ReactNode } from "react";

import { Icon, type IconName } from "@/components/common/Icon";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type PublicSegmentedTabItem<TValue extends string = string> = {
  id: TValue;
  icon?: IconName;
  label: ReactNode;
  suffix?: ReactNode;
  disabled?: boolean;
  prominence?: "default" | "major";
  breakAfter?: boolean;
  breakAfterClassName?: string;
};

export interface PublicSegmentedTabsProps<TValue extends string = string> {
  ariaLabel?: string;
  className?: string;
  items: PublicSegmentedTabItem<TValue>[];
  listClassName?: string;
  onItemSelect?: (
    item: PublicSegmentedTabItem<TValue>,
    meta: { wasActive: boolean },
  ) => void;
  onValueChange?: (value: TValue) => void;
  value: TValue;
  mobileVariant?: "default" | "appGrid";
  mobileClassName?: string;
}

function renderMobileFilterLabel(label: ReactNode) {
  return (
    <span className="theme-index-mobile-tab-label block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[0.625rem] leading-3 font-semibold">
      {label}
    </span>
  );
}

const MOBILE_FILTER_COLUMN_START: Record<number, string> = {
  1: "col-start-1",
  2: "col-start-2",
  3: "col-start-3",
  4: "col-start-4",
  5: "col-start-5",
  6: "col-start-6",
  7: "col-start-7",
};

function getMobileFilterItemPositionClassName(index: number, itemCount: number) {
  const rowCount = Math.ceil(itemCount / 4);
  const baseSize = Math.floor(itemCount / rowCount);
  const wideRows = itemCount % rowCount;
  const wideSpan = wideRows * (baseSize + 1);
  const rowSize = index < wideSpan ? baseSize + 1 : baseSize;
  const indexInRow =
    index < wideSpan ? index % (baseSize + 1) : (index - wideSpan) % baseSize;
  const rowStart = 1 + (4 - rowSize);
  return MOBILE_FILTER_COLUMN_START[rowStart + indexInRow * 2];
}

export function PublicSegmentedTabs<TValue extends string = string>({
  ariaLabel,
  className,
  items,
  listClassName,
  onItemSelect,
  onValueChange,
  value,
  mobileVariant = "default",
  mobileClassName,
}: PublicSegmentedTabsProps<TValue>) {
  const isAppGrid = mobileVariant === "appGrid";

  const pressedValueRef = useRef<TValue | null>(null);

  const desktopTabs = (
    <Tabs
      value={value}
      onValueChange={onValueChange ? (nextValue) => onValueChange(nextValue as TValue) : undefined}
      className={cn(
        isAppGrid ? "hidden justify-center sm:flex" : "flex justify-center",
        isAppGrid ? undefined : className,
      )}
    >
      <TabsList
        aria-label={ariaLabel}
        className={cn(
          "theme-route-tabs-list theme-text-muted h-auto flex-wrap gap-1.5 !border-0 !bg-transparent p-0 shadow-[var(--theme-elevation-none)]",
          listClassName,
        )}
      >
        {items.map((item) => (
          <Fragment key={item.id}>
          <TabsTrigger
            value={item.id}
            disabled={item.disabled}
            onPointerDown={() => {
              pressedValueRef.current = value;
            }}
            onClick={
              onItemSelect
                ? () => {
                    const pressedFrom = pressedValueRef.current ?? value;
                    pressedValueRef.current = null;
                    onItemSelect(item, { wasActive: pressedFrom === item.id });
                  }
                : undefined
            }
            className={cn(
              "theme-selected-control group relative isolate h-9 gap-1.5 overflow-hidden rounded-full border border-transparent px-3 text-sm transition-[transform,background-color,color,box-shadow,border-color] duration-[var(--motion-base)] ease-[var(--ease-out)] motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11",
              item.prominence === "major" ? "font-semibold" : "font-medium",
            )}
          >
            {item.icon ? (
              <span
                className={cn(
                  "theme-selected-control-icon relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 transition-[background-color,color,box-shadow,transform] duration-[var(--motion-base)] ease-[var(--ease-out)] motion-reduce:transition-none",
                  item.id !== value && "bg-transparent ring-transparent shadow-[var(--theme-elevation-none)]",
                )}
              >
                <Icon icon={item.icon} size={16} />
              </span>
            ) : null}
            {item.label}
            {item.suffix ? (
              <span className="text-xs opacity-70">{item.suffix}</span>
            ) : null}
          </TabsTrigger>
          {item.breakAfter ? (
            <span
              aria-hidden
              className={cn("h-0 basis-full", item.breakAfterClassName)}
            />
          ) : null}
          </Fragment>
        ))}
      </TabsList>
    </Tabs>
  );

  if (!isAppGrid) {
    return desktopTabs;
  }

  return (
    <div className={className}>
      <div className={cn("sm:hidden", mobileClassName)}>
        <div
          role="group"
          aria-label={ariaLabel}
          className="mx-auto grid w-full max-w-[22rem] grid-cols-8 gap-x-1.5 gap-y-3 px-1"
        >
          {items.map((item, index) => {
            const isActive = item.id === value;

            return (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                aria-pressed={isActive}
                data-state={isActive ? "active" : "inactive"}
                onClick={() => {
                  const wasActive = item.id === value;
                  onValueChange?.(item.id);
                  onItemSelect?.(item, { wasActive });
                }}
                className={cn(
                  "theme-index-mobile-tab group col-span-2 flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-0 py-1 text-center transition-[color,transform] duration-[var(--motion-base)] ease-[var(--ease-out)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50",
                  getMobileFilterItemPositionClassName(index, items.length),
                )}
              >
                <span className="theme-index-mobile-tab-icon flex h-[3.5rem] w-[3.5rem] shrink-0 items-center justify-center rounded-[1.2rem] transition-[background,color,box-shadow] duration-[var(--motion-base)] ease-[var(--ease-out)] motion-reduce:transition-none">
                  {item.icon ? <Icon icon={item.icon} size={38} /> : null}
                </span>
                {renderMobileFilterLabel(item.label)}
              </button>
            );
          })}
        </div>
      </div>
      {desktopTabs}
    </div>
  );
}
