"use client";

import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/common/Icon";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const LIGHT_FROSTED_PANEL_CLASSES =
  "[html[data-theme='light']_&]:border-[color:var(--theme-light-frosted-panel-border)] [html[data-theme='light']_&]:[background:var(--theme-light-frosted-panel-bg)] [html[data-theme='light']_&]:[box-shadow:var(--theme-light-frosted-panel-shadow)]";

export type PublicSegmentedTabItem<TValue extends string = string> = {
  id: TValue;
  icon?: IconName;
  label: ReactNode;
  suffix?: ReactNode;
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
          "h-auto flex-wrap gap-1 rounded-2xl border p-1.5",
          LIGHT_FROSTED_PANEL_CLASSES,
          listClassName,
        )}
      >
        {items.map((item) => (
          <TabsTrigger
            key={item.id}
            value={item.id}
            onClick={onItemSelect ? () => onItemSelect(item) : undefined}
            className={cn(
              "theme-public-segmented-tab gap-2.5 rounded-xl border border-transparent px-5 py-2.5 text-[0.9375rem] font-medium transition-[background-color,color,box-shadow,border-color] duration-300",
            )}
          >
            {item.icon ? <Icon icon={item.icon} size={18} /> : null}
            {item.label}
            {item.suffix ? (
              <span className="text-xs opacity-70">{item.suffix}</span>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
