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
   * `disabled:opacity-50` and blocks pointer events.
   */
  disabled?: boolean;
  /** "major" renders a bolder label for overarching tabs; geometry stays uniform. */
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
 * Balance the mobile tile rows so the last one is never a lone straggler:
 * five tabs split 3 + 2 rather than 4 + 1, seventeen split 4/4/3/3/3. The
 * grid has eight tracks and every tile spans two, so a row of 3, 2, or 1
 * tiles can start on an odd column and sit centred under the full rows.
 * Returns the explicit column start of every tile so the grid never
 * auto-flows into a left-aligned row.
 */
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
  // Rows are `baseSize + 1` for the first `wideRows`, then `baseSize`.
  const wideSpan = wideRows * (baseSize + 1);
  const rowSize = index < wideSpan ? baseSize + 1 : baseSize;
  const indexInRow =
    index < wideSpan ? index % (baseSize + 1) : (index - wideSpan) % baseSize;
  const rowStart = 1 + (4 - rowSize);
  return MOBILE_FILTER_COLUMN_START[rowStart + indexInRow * 2];
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
              "theme-selected-control group relative isolate min-h-8 gap-1.5 overflow-hidden rounded-full border border-transparent px-3 py-1.5 text-sm transition-[transform,background-color,color,box-shadow,border-color] duration-[260ms] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11",
              item.prominence === "major" ? "font-semibold" : "font-medium",
            )}
          >
            {item.icon ? (
              <span
                className={cn(
                  "theme-selected-control-icon relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 transition-[background-color,color,box-shadow,transform] duration-300",
                  item.id !== value && "bg-transparent ring-transparent shadow-[var(--theme-elevation-none)]",
                )}
              >
                <Icon icon={item.icon} size={17} />
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
                  // The mobile button calls `onValueChange` directly (no Radix
                  // focus activation), so `value` is still the pre-click active
                  // tab here and reads correctly.
                  const wasActive = item.id === value;
                  onValueChange?.(item.id);
                  onItemSelect?.(item, { wasActive });
                }}
                className={cn(
                  "theme-index-mobile-tab group col-span-2 flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-0 py-1 text-center transition-[color,transform] duration-[220ms] ease-[cubic-bezier(0.25,1,0.5,1)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50",
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
