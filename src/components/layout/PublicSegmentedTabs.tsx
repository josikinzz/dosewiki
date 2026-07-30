"use client";

import { Fragment, useRef, type ReactNode } from "react";

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
  /**
   * Fires on every click of a tab, after `onValueChange`. The `wasActive` flag
   * reports whether the clicked tab was already the active tab *before* the
   * click, so callers can distinguish switching to a tab (`false`) from
   * re-clicking the tab you are already on (`true`). This is computed at
   * pointer-down on desktop because Radix activates triggers on focus — a
   * separate event that updates `value` before the click handler runs.
   */
  onItemSelect?: (
    item: PublicSegmentedTabItem<TValue>,
    meta: { wasActive: boolean },
  ) => void;
  onValueChange?: (value: TValue) => void;
  value: TValue;
  /**
   * Mobile rendering for index pages.
   * - "default": the pill row reflows on every viewport.
   * - "appGrid": on `< sm` the control collapses into a centered grid of
   *   app-style rounded-square icons (the shared substance/effects index
   *   treatment); on `>= sm` it returns to the standard pill row.
   */
  mobileVariant?: "default" | "appGrid";
  /**
   * Classes for the mobile app-grid wrapper (e.g. a negative top margin to seat
   * the grid under a page header). Only applies when `mobileVariant="appGrid"`.
   */
  mobileClassName?: string;
}

/**
 * Mobile app-grid label: a tight, single-line caption under each icon tile.
 */
function renderMobileFilterLabel(label: ReactNode) {
  return (
    <span className="theme-index-mobile-tab-label block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[0.625rem] leading-3 font-semibold">
      {label}
    </span>
  );
}

/**
 * Center a lone trailing pair so a 4-column grid never leaves two tiles
 * stranded against the left edge. Only a remainder of exactly two needs the
 * nudge — one tile centers naturally and three already balance.
 */
function getMobileFilterItemPositionClassName(index: number, itemCount: number) {
  const remainder = itemCount % 4;
  if (remainder === 2 && index === itemCount - remainder) {
    return "col-start-2";
  }
  return undefined;
}

/**
 * Shared segmented tabs for public index pages. Uses the same route-tab
 * construction as the substance article's Dosage & Duration tabs so every
 * "pick one of N views" control on the site is the same object.
 *
 * With `mobileVariant="appGrid"` the substance and effect indexes share one
 * responsive control: an app-style icon grid on small screens that becomes the
 * standard pill row from `sm` up.
 */
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

  // Radix activates a trigger on focus (automatic activation), which fires
  // `onValueChange` and re-renders with the new `value` *before* the trigger's
  // own `click` event runs. Capture the value at pointer-down — before that
  // re-render — so `onItemSelect` can tell a first click (switch) from a
  // re-click of the already-active tab.
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
                    // Fall back to `value` for keyboard activation, where no
                    // pointer-down fires.
                    const pressedFrom = pressedValueRef.current ?? value;
                    pressedValueRef.current = null;
                    onItemSelect(item, { wasActive: pressedFrom === item.id });
                  }
                : undefined
            }
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
                  item.id !== value && "bg-transparent ring-transparent shadow-[var(--theme-elevation-none)]",
                )}
              >
                <Icon icon={item.icon} size={item.prominence === "major" ? 19 : 17} />
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
          className="mx-auto grid w-full max-w-[22rem] grid-cols-4 gap-x-1.5 gap-y-3 px-1"
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
                  // The mobile button calls `onValueChange` directly (no Radix
                  // focus activation), so `value` is still the pre-click active
                  // tab here and reads correctly.
                  const wasActive = item.id === value;
                  onValueChange?.(item.id);
                  onItemSelect?.(item, { wasActive });
                }}
                className={cn(
                  "theme-index-mobile-tab group flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-0 py-1 text-center transition-[color,transform] duration-[220ms] ease-[cubic-bezier(0.25,1,0.5,1)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50",
                  getMobileFilterItemPositionClassName(index, items.length),
                )}
              >
                <span className="theme-index-mobile-tab-icon flex h-[3.5rem] w-[3.5rem] shrink-0 items-center justify-center rounded-[1.2rem] transition-[background,color,box-shadow,transform] duration-[260ms] ease-[cubic-bezier(0.25,1,0.5,1)] group-active:scale-[0.96] motion-reduce:transition-none motion-reduce:group-active:scale-100">
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
