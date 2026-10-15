import { useState, type MouseEvent } from "react";
import { Icon } from "@/components/common/Icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";
import type { DevModeTab } from "./devTabRegistry";
import type {
  DevModeToolNavigationProps,
  LockedToolItem,
  ToolTabItem,
} from "./DevModeToolTypes";

export const RAIL_CLASS =
  "theme-dev-rail hidden min-h-11 w-full flex-nowrap items-center gap-1 rounded-card border px-1.5 py-1.5 md:flex";

export const RAIL_STRIP_CLASS =
  "relative flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto overscroll-x-contain px-1 scroll-px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden motion-safe:scroll-smooth"
  + " data-scroll-start:[mask-image:linear-gradient(to_right,transparent,#000_0.75rem)]"
  + " data-scroll-end:[mask-image:linear-gradient(to_left,transparent,#000_0.75rem)]"
  + " data-scroll-start:data-scroll-end:[mask-image:linear-gradient(to_right,transparent,#000_0.75rem,#000_calc(100%_-_0.75rem),transparent)]";

export const RAIL_SCROLL_MARGIN_PX = 24;
export const RAIL_SCROLL_PAGE_RATIO = 0.7;
export const RAIL_EDGE_SLACK_PX = 4;

export const RAIL_TAB_CLASS =
  "theme-dev-rail-tab inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control px-2 text-sm 2xl:px-2.5 font-medium transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-45 [@media(pointer:coarse)]:min-h-11";

export const MENU_ROW_CLASS =
  "theme-dev-rail-tab flex min-h-9 w-full items-center gap-2.5 rounded-control px-2.5 py-1.5 text-left text-sm font-medium transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11";
const MENU_CONTENT_CLASS = "p-1.5 motion-reduce:animate-none";

export const RAIL_GROUP_CAPTION_CLASS = "theme-dev-rail-group type-meta-label shrink-0 select-none";

export const RAIL_ICON_BUTTON_CLASS =
  `theme-dev-rail-button flex h-8 w-8 shrink-0 items-center justify-center rounded-control transition-colors duration-200 motion-reduce:transition-none ${TOUCH_ICON}`;
export const INLINE_RAIL_TOTAL_LIMIT = 5;

export function RailDivider({ className }: { className?: string }) {
  return <span aria-hidden className={cn("theme-dev-rail-divider mx-1 h-5 w-px shrink-0", className)} />;
}

export function countBadgeSuffix(count: number, label = "awaiting review", stale = false, atLeast = false) {
  return `, ${atLeast ? "at least " : ""}${count} ${label}${stale ? ", may be out of date" : ""}`;
}

export function CountBadge({
  count,
  label = "awaiting review",
  announce = true,
  stale = false,
  atLeast = false,
}: {
  count: number;
  label?: string;
  announce?: boolean;
  stale?: boolean;
  atLeast?: boolean;
}) {
  const counted = `${atLeast ? "At least " : ""}${count} ${label}${stale ? " when last checked" : ""}`;
  const title =
    atLeast || stale
      ? [`${counted}.`, atLeast ? "One of the counts did not load." : null, stale ? "The latest refresh failed." : null].filter(Boolean).join(" ")
      : counted;
  return (
    <>
      <span aria-hidden data-stale={stale ? "" : undefined} title={title} className="theme-dev-count-badge inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold leading-none tabular-nums">
        {count}
        {atLeast ? "+" : null}
      </span>
      {announce ? <span className="sr-only">{countBadgeSuffix(count, label, stale, atLeast)}</span> : null}
    </>
  );
}

export function UnsavedDot({ announce = true }: { announce?: boolean }) {
  return (
    <>
      <span aria-hidden title="Unsaved changes" className="theme-dev-unsaved-dot inline-block h-2 w-2 shrink-0 rounded-full" />
      {announce ? <span className="sr-only">, unsaved changes</span> : null}
    </>
  );
}

export function SpokenLabel({ visible, spoken, className }: { visible: string; spoken: string; className?: string }) {
  if (spoken === visible) {
    return <span className={className}>{visible}</span>;
  }
  return (
    <span className={className}>
      <span aria-hidden>{visible}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

export function ToolLabel({ label, unsaved, badge, stale, atLeast, className }: { label: string; unsaved?: boolean; badge?: number; stale?: boolean; atLeast?: boolean; className?: string }) {
  const suffix = `${unsaved ? ", unsaved changes" : ""}${badge ? countBadgeSuffix(badge, undefined, stale, atLeast) : ""}`;
  return <SpokenLabel visible={label} spoken={`${label}${suffix}`} className={className} />;
}

export function ToolMarks({ unsaved, badge, stale, atLeast, pushBadge = false }: { unsaved?: boolean; badge?: number; stale?: boolean; atLeast?: boolean; pushBadge?: boolean }) {
  return (
    <>
      {unsaved ? <UnsavedDot announce={false} /> : null}
      {badge ? <span className={cn("inline-flex", pushBadge && "ml-auto")}><CountBadge count={badge} announce={false} stale={stale} atLeast={atLeast} /></span> : null}
    </>
  );
}

export function guardedLinkProps(href: string, onOpenHref: ((href: string) => void) | undefined) {
  return {
    href,
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      if (!onOpenHref || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      onOpenHref(href);
    },
  };
}

export function ToolGlyph({ icon, className }: { icon: string; className?: string }) {
  return <Icon icon={icon} size={16} className={cn("theme-dev-tool-glyph shrink-0", className)} />;
}

export function MenuChevron({ open }: { open: boolean }) {
  return <Icon icon="lucide:chevron-down" size={14} className={cn("theme-text-faint shrink-0 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />;
}

function ExternalGlyph() {
  return <Icon icon="lucide:arrow-up-right" size={13} className="theme-text-faint shrink-0" />;
}

function RailPill({ item, isActive, onTabChange, onOpenHref }: { item: ToolTabItem; isActive: boolean; onTabChange: (tab: DevModeTab) => void; onOpenHref?: (href: string) => void }) {
  if (item.destination.kind === "external") {
    return (
      <a {...guardedLinkProps(item.destination.href, onOpenHref)} title={`Opens ${item.label} full screen`} className={RAIL_TAB_CLASS}>
        <ToolLabel label={item.label} badge={item.badge} stale={item.stale} atLeast={item.atLeast} />
        <ExternalGlyph />
        <ToolMarks badge={item.badge} stale={item.stale} atLeast={item.atLeast} />
      </a>
    );
  }
  return (
    <button type="button" disabled={item.pending !== undefined} title={item.pending} aria-current={isActive ? "page" : undefined} data-state={isActive ? "active" : "inactive"} onClick={() => onTabChange(item.id)} className={RAIL_TAB_CLASS}>
      <ToolLabel label={item.label} unsaved={item.unsaved} badge={item.badge} stale={item.stale} atLeast={item.atLeast} />
      <ToolMarks unsaved={item.unsaved} badge={item.badge} stale={item.stale} atLeast={item.atLeast} />
    </button>
  );
}

export function RailInlineGroup({ label, tabs, activeTab, isToolsSection, onTabChange, onOpenHref, showDivider }: DevModeToolNavigationProps & { label: string; tabs: readonly ToolTabItem[]; showDivider: boolean }) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 items-center gap-0.5">
      {showDivider ? <RailDivider /> : null}
      {tabs.map((item) => <RailPill key={item.id} item={item} isActive={isToolsSection && activeTab === item.id} onTabChange={onTabChange} onOpenHref={onOpenHref} />)}
    </div>
  );
}

export function RailGroupMenu({ label, tabs, activeTab, isToolsSection, onTabChange, onOpenHref, showDivider, rollUpBadges = true }: DevModeToolNavigationProps & { label: string; tabs: readonly ToolTabItem[]; showDivider: boolean; rollUpBadges?: boolean }) {
  const [open, setOpen] = useState(false);
  const activeItem = isToolsSection ? tabs.find((tab) => tab.id === activeTab) : undefined;
  const badgeTotal = rollUpBadges ? tabs.reduce((sum, tab) => sum + (tab.badge ?? 0), 0) : 0;
  const pending = tabs.find((tab) => tab.pending)?.pending;
  const unsaved = tabs.some((tab) => tab.unsaved);
  const stale = badgeTotal > 0 && tabs.some((tab) => tab.stale && tab.badge);
  const atLeast = badgeTotal > 0 && tabs.some((tab) => tab.atLeast && tab.badge);
  return (
    <div role="group" aria-label={label} className="flex shrink-0 items-center">
      {showDivider ? <RailDivider /> : null}
      <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button type="button" disabled={pending !== undefined} title={pending} data-active={activeItem ? "" : undefined} className={RAIL_TAB_CLASS}>
            <SpokenLabel
              visible={label}
              spoken={`${label}${activeItem ? `, current tool ${activeItem.label}` : ""}${unsaved ? ", unsaved changes" : ""}${badgeTotal ? countBadgeSuffix(badgeTotal, undefined, stale, atLeast) : ""}`}
            />
            {activeItem ? (
              <span aria-hidden className="theme-dev-rail-menu-current inline-flex items-center gap-1.5 font-semibold">
                <span className="theme-dev-rail-divider h-3.5 w-px" />
                {activeItem.label}
              </span>
            ) : null}
            <ToolMarks unsaved={unsaved} badge={badgeTotal || undefined} stale={stale} atLeast={atLeast} />
            <MenuChevron open={open} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" aria-label={`${label} tools`} className={`w-60 ${MENU_CONTENT_CLASS}`}>
          <DropdownMenuLabel className="px-2.5">{label}</DropdownMenuLabel>
          {tabs.map((item) => {
            const itemActive = isToolsSection && activeTab === item.id;
            if (item.destination.kind === "external") {
              return <DropdownMenuItem key={item.id} asChild className={MENU_ROW_CLASS}><a {...guardedLinkProps(item.destination.href, onOpenHref)}><ToolGlyph icon={item.icon} /><ToolLabel label={item.label} badge={item.badge} stale={item.stale} atLeast={item.atLeast} /><ExternalGlyph /><ToolMarks badge={item.badge} stale={item.stale} atLeast={item.atLeast} pushBadge /></a></DropdownMenuItem>;
            }
            return (
              <DropdownMenuItem key={item.id} aria-current={itemActive ? "page" : undefined} disabled={item.pending !== undefined} data-state={itemActive ? "active" : "inactive"} onSelect={() => onTabChange(item.id)} className={MENU_ROW_CLASS}>
                <ToolGlyph icon={item.icon} />
                <ToolLabel label={item.label} unsaved={item.unsaved} badge={item.badge} stale={item.stale} atLeast={item.atLeast} />
                <ToolMarks unsaved={item.unsaved} badge={item.badge} stale={item.stale} atLeast={item.atLeast} pushBadge />
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function groupLockedByReason(locked: readonly LockedToolItem[]): { reason: string; items: LockedToolItem[] }[] {
  const groups = new Map<string, LockedToolItem[]>();
  for (const item of locked) {
    const list = groups.get(item.reason) ?? [];
    list.push(item);
    groups.set(item.reason, list);
  }
  return [...groups].map(([reason, items]) => ({ reason, items }));
}

export function RailLockedMenu({ locked, showDivider = true }: { locked: readonly LockedToolItem[]; showDivider?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div role="group" aria-label="Locked tools" className="flex shrink-0 items-center">
      {showDivider ? <RailDivider /> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className={cn(RAIL_TAB_CLASS, "theme-text-faint")}>
            <Icon icon="lucide:lock" size={13} className="shrink-0" />
            <SpokenLabel visible="Locked" spoken={`Locked, ${locked.length} locked`} />
            <span aria-hidden className="tabular-nums">{locked.length}</span>
            <MenuChevron open={open} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" aria-label="Locked tools" className="w-72 p-1.5 motion-reduce:animate-none">
          <LockedToolList locked={locked} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function LockedToolList({ locked }: { locked: readonly LockedToolItem[] }) {
  return (
    <div className="flex flex-col gap-1">
      {groupLockedByReason(locked).map(({ reason, items }) => (
        <section key={reason} aria-label={reason} className="flex flex-col">
          <h3 className="theme-menu-label px-2.5 pb-1 pt-2">{reason}</h3>
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.id} className="theme-text-muted flex min-h-9 items-center gap-2.5 px-2.5 text-sm">
                <ToolGlyph icon={item.icon} />
                <SpokenLabel visible={item.label} spoken={`${item.label}: ${item.reason}`} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="theme-divider-border theme-text-faint mt-1 border-t px-2.5 pb-1 pt-2 text-xs leading-snug">
        Access follows your role. Ask an admin if you need one of these.
      </p>
    </div>
  );
}
