import { useState } from "react";
import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import type { DevModeTab } from "./devTabRegistry";
import type {
  DevModeToolNavigationProps,
  LockedToolItem,
  ToolTabItem,
} from "./DevModeToolTypes";

export const RAIL_CLASS =
  "theme-dev-rail hidden min-h-10 w-full flex-nowrap items-center gap-1 rounded-lg border px-1.5 py-1 md:flex";

export const RAIL_STRIP_CLASS =
  "relative flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain px-3 py-1 scroll-px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden motion-safe:scroll-smooth"
  + " data-scroll-start:[mask-image:linear-gradient(to_right,transparent,#000_0.75rem)]"
  + " data-scroll-end:[mask-image:linear-gradient(to_left,transparent,#000_0.75rem)]"
  + " data-scroll-start:data-scroll-end:[mask-image:linear-gradient(to_right,transparent,#000_0.75rem,#000_calc(100%_-_0.75rem),transparent)]";

export const RAIL_SCROLL_MARGIN_PX = 24;
export const RAIL_SCROLL_PAGE_RATIO = 0.7;
export const RAIL_EDGE_SLACK_PX = 4;

export const RAIL_TAB_CLASS =
  "theme-dev-rail-tab shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-[0.8125rem] font-medium transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-45 data-[state=active]:font-semibold [@media(pointer:coarse)]:min-h-11";

const MENU_TAB_CLASS =
  "theme-dev-rail-tab flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[0.8125rem] font-medium transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none data-[state=active]:font-semibold [@media(pointer:coarse)]:min-h-11";
const MENU_CONTENT_CLASS = "p-1.5 motion-reduce:animate-none";
const RAIL_GROUP_CAPTION_CLASS =
  "theme-dev-rail-group shrink-0 select-none px-1 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em]";
export const RAIL_ICON_BUTTON_CLASS =
  `theme-dev-rail-button flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors duration-200 motion-reduce:transition-none ${TOUCH_ICON}`;
export const INLINE_RAIL_TOTAL_LIMIT = 5;

export function RailDivider() {
  return <span aria-hidden className="theme-dev-rail-divider mx-1 h-4 w-px shrink-0" />;
}

function CountBadge({ count, label = "awaiting review" }: { count: number; label?: string }) {
  return (
    <>
      <span aria-hidden title={`${count} ${label}`} className="theme-portal-count-badge inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-semibold leading-none">
        {count}
      </span>
      <span className="sr-only">{`, ${count} ${label}`}</span>
    </>
  );
}

function RailPill({ item, isActive, onTabChange }: { item: ToolTabItem; isActive: boolean; onTabChange: (tab: DevModeTab) => void }) {
  const badge = item.badge ? <CountBadge count={item.badge} /> : null;
  if (item.destination.kind === "external") {
    return (
      <a href={item.destination.href} title={`Opens ${item.label} full screen`} className={`${RAIL_TAB_CLASS} inline-flex items-center gap-1`}>
        {item.label}
        <Icon icon="lucide:arrow-up-right" size={12} className="text-current" />
        {badge}
      </a>
    );
  }
  return (
    <button type="button" disabled={item.pending !== undefined} aria-disabled={item.pending !== undefined ? "true" : undefined} title={item.pending} aria-current={isActive ? "page" : undefined} data-state={isActive ? "active" : "inactive"} onClick={() => onTabChange(item.id)} className={`${RAIL_TAB_CLASS} inline-flex items-center gap-1.5`}>
      {item.label}
      {badge}
    </button>
  );
}

export function RailInlineGroup({ label, tabs, activeTab, isToolsSection, onTabChange, showDivider }: DevModeToolNavigationProps & { label: string; tabs: readonly ToolTabItem[]; showDivider: boolean }) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 items-center gap-0.5">
      {showDivider ? <RailDivider /> : null}
      <span aria-hidden className={RAIL_GROUP_CAPTION_CLASS}>{label}</span>
      {tabs.map((item) => <RailPill key={item.id} item={item} isActive={isToolsSection && activeTab === item.id} onTabChange={onTabChange} />)}
    </div>
  );
}

export function RailGroupMenu({ label, tabs, activeTab, isToolsSection, onTabChange, showDivider }: DevModeToolNavigationProps & { label: string; tabs: readonly ToolTabItem[]; showDivider: boolean }) {
  const [open, setOpen] = useState(false);
  const isActive = isToolsSection && tabs.some((tab) => tab.id === activeTab);
  const badgeTotal = tabs.reduce((sum, tab) => sum + (tab.badge ?? 0), 0);
  const pending = tabs.find((tab) => tab.pending)?.pending;
  return (
    <div role="group" aria-label={label} className="flex shrink-0 items-center">
      {showDivider ? <RailDivider /> : null}
      <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button type="button" disabled={pending !== undefined} aria-disabled={pending !== undefined ? "true" : undefined} title={pending} data-active={isActive || undefined} className={`${RAIL_TAB_CLASS} inline-flex items-center gap-1.5`}>
            {label}
            {badgeTotal > 0 ? <CountBadge count={badgeTotal} /> : null}
            <ExpandIndicator isExpanded={open} variant="compact" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" aria-label={`${label} tools`} className={`w-56 ${MENU_CONTENT_CLASS}`}>
          {tabs.map((item) => {
            const itemActive = isToolsSection && activeTab === item.id;
            if (item.destination.kind === "external") {
              return <DropdownMenuItem key={item.id} asChild className={MENU_TAB_CLASS}><a href={item.destination.href}>{item.label}<Icon icon="lucide:arrow-up-right" size={12} className="text-current" />{item.badge ? <CountBadge count={item.badge} /> : null}</a></DropdownMenuItem>;
            }
            return <DropdownMenuItem key={item.id} aria-current={itemActive ? "page" : undefined} disabled={item.pending !== undefined} data-state={itemActive ? "active" : "inactive"} onSelect={() => onTabChange(item.id)} className={MENU_TAB_CLASS}>{item.label}{item.badge ? <CountBadge count={item.badge} /> : null}</DropdownMenuItem>;
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function RailLockedMenu({ locked }: { locked: readonly LockedToolItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div role="group" aria-label="Locked tools" className="flex shrink-0 items-center">
      <RailDivider />
      <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild><button type="button" className={`${RAIL_TAB_CLASS} inline-flex items-center gap-1.5`}>Locked<CountBadge count={locked.length} label="locked" /><ExpandIndicator isExpanded={open} variant="compact" /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" aria-label="Locked tools" className={`w-64 ${MENU_CONTENT_CLASS}`}>
          {locked.map((item) => <DropdownMenuItem key={item.id} disabled className={`${MENU_TAB_CLASS} justify-between gap-3`}><span>{item.label}</span><span className="theme-text-muted text-xs font-normal">{item.reason}</span></DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
