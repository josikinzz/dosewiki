"use client";

import { Fragment, type ReactNode } from "react";

import { Icon, type IconName } from "@/components/common/Icon";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type PublicSegmentedTabItem<TValue extends string = string> = {
  id: TValue;
  icon?: IconName;
  label: ReactNode;
  /**
   * Trailing slot rendered after the label (e.g. a count or badge). Existing
   * public adopters pass nothing; dev chrome maps any prior badge into this.
   */
  suffix?: ReactNode;
  /**
   * Disable the tab. Forwarded to the Radix TabsTrigger, which already styles
   * `disabled:opacity-50` and blocks pointer events. Used by the dev chrome's
   * Profile tab to preserve its `!hasStoredCredentials` guard.
   */
  disabled?: boolean;
  /** "major" renders a larger, bolder pill for overarching tabs. */
  prominence?: "default" | "major";
  /** Force the items after this one onto a new row (flex line break). */
  breakAfter?: boolean;
  /**
   * Classes for the forced-break spacer. Use a responsive utility such as
   * "hidden xl:block" to only break the row at wider breakpoints.
   */
  breakAfterClassName?: string;
};

export interface PublicSegmentedTabsProps<TValue extends string = string> {
  ariaLabel?: string;
  className?: string;
  items: PublicSegmentedTabItem<TValue>[];
  listClassName?: string;
  onItemSelect?: (item: PublicSegmentedTabItem<TValue>) => void;
  onValueChange?: (value: TValue) => void;
  value: TValue;
}

/**
 * Shared segmented tabs for public index pages. Uses the same route-tab
 * construction as the substance article's Dosage & Duration tabs so every
 * "pick one of N views" control on the site is the same object.
 */
export function PublicSegmentedTabs<TValue extends string = string>({
  ariaLabel,
  className,
  items,
  listClassName,
  onItemSelect,
  onValueChange,
  value,
}: PublicSegmentedTabsProps<TValue>) {
  return (
    <Tabs
      value={value}
      onValueChange={onValueChange ? (nextValue) => onValueChange(nextValue as TValue) : undefined}
      className={cn("flex justify-center", className)}
    >
      <TabsList
        aria-label={ariaLabel}
        className={cn(
          "theme-route-tabs-list theme-text-muted h-auto flex-wrap gap-1.5 !border-0 !bg-transparent p-0 shadow-none",
          listClassName,
        )}
      >
        {items.map((item) => (
          <Fragment key={item.id}>
          <TabsTrigger
            value={item.id}
            disabled={item.disabled}
            onClick={onItemSelect ? () => onItemSelect(item) : undefined}
            className={cn(
              "theme-route-tab group relative isolate overflow-hidden rounded-full border border-transparent font-medium transition-[transform,background-color,color,box-shadow,border-color] duration-[260ms] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11",
              item.prominence === "major"
                ? "min-h-9 gap-2 px-4 py-2 text-[0.9375rem] font-semibold"
                : "min-h-8 gap-1.5 px-3 py-1.5 text-sm",
            )}
          >
            {item.icon ? (
              <span
                className={cn(
                  "theme-route-tab-icon relative flex shrink-0 items-center justify-center rounded-full ring-1 transition-[background-color,color,box-shadow,transform] duration-300",
                  item.prominence === "major" ? "h-7 w-7" : "h-6 w-6",
                  item.id !== value && "bg-transparent ring-transparent shadow-none",
                )}
              >
                <Icon icon={item.icon} size={item.prominence === "major" ? 17 : 15} />
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
}
