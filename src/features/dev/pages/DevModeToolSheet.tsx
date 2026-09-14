import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import { useRef, useState, type RefObject } from "react";
import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import {
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { DEV_UTILITIES } from "./DevUtilitiesMenu";
import type { DevModeToolSheetProps, GroupView } from "./DevModeToolTypes";

const SHEET_TAB_CLASS =
  "theme-dev-rail-tab flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[0.9375rem] font-medium transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-45 data-[state=active]:font-semibold";
const GROUP_CAPTION_CLASS =
  "theme-dev-rail-group shrink-0 select-none px-1 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em]";
const ICON_BUTTON_CLASS =
  `theme-dev-rail-button flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors duration-200 motion-reduce:transition-none ${TOUCH_ICON}`;

function CountBadge({ count }: { count: number }) {
  return (
    <>
      <span aria-hidden title={`${count} awaiting review`} className="theme-portal-count-badge inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-semibold leading-none">{count}</span>
      <span className="sr-only">{`, ${count} awaiting review`}</span>
    </>
  );
}

function SheetToolList({ groups, activeTab, isToolsSection, activeRowRef, onTabChange }: {
  groups: readonly GroupView[];
  activeTab: DevModeToolSheetProps["activeTab"];
  isToolsSection: boolean;
  onTabChange: DevModeToolSheetProps["onTabChange"];
  activeRowRef: RefObject<HTMLButtonElement | HTMLAnchorElement | null>;
}) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.id} role="group" aria-label={group.label} className="flex flex-col gap-0.5">
          <span aria-hidden className={`${GROUP_CAPTION_CLASS} px-3 pb-1 pt-2`}>{group.label}</span>
          {[
            ...group.enabled.map((item) => ({ item, lockReason: item.pending ?? null })),
            ...group.locked.map((item) => ({ item, lockReason: item.reason as string | null })),
          ].map(({ item, lockReason }) => {
            const badge = item.badge ? <CountBadge count={item.badge} /> : null;
            if (item.destination.kind === "external") {
              return <a key={item.id} href={item.destination.href} title={`Opens ${item.label} full screen`} className={SHEET_TAB_CLASS}>{item.label}<Icon icon="lucide:arrow-up-right" size={12} className="text-current" />{badge}</a>;
            }
            const isActive = isToolsSection && activeTab === item.id;
            return (
              <button key={item.id} ref={isActive ? (activeRowRef as RefObject<HTMLButtonElement>) : undefined} type="button" disabled={lockReason !== null} aria-disabled={lockReason !== null ? "true" : undefined} aria-current={isActive ? "page" : undefined} data-state={isActive ? "active" : "inactive"} onClick={() => onTabChange(item.id)} className={SHEET_TAB_CLASS}>
                {item.label}{badge}
                {lockReason ? <span className="theme-text-muted ml-auto text-xs font-normal">{lockReason}</span> : null}
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

export function DevToolSheet({
  groups,
  activeTab,
  isToolsSection,
  onTabChange,
  activePrimaryTab,
  activeLabel,
  changeLogLockReason,
  onPrimaryTabChange,
  onLeave,
  session,
}: DevModeToolSheetProps) {
  const [open, setOpen] = useState(false);
  const activeRowRef = useRef<HTMLButtonElement | HTMLAnchorElement | null>(null);
  const closeThen = <T,>(action: (value: T) => void) => (value: T) => {
    setOpen(false);
    action(value);
  };
  const changeLogActive = activePrimaryTab === "change-log";
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button type="button" aria-label={`Tools menu, current tool ${activeLabel}`} className="theme-dev-rail-tab flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-3 text-left text-[0.9375rem] font-semibold transition-colors duration-200 motion-reduce:transition-none">
          <span className="min-w-0 truncate">{activeLabel}</span>
          <ExpandIndicator isExpanded={open} variant="compact" className="theme-text-muted ml-auto shrink-0" />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          aria-label="Dev mode tools menu"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const row = activeRowRef.current;
            if (row) {
              row.focus();
              row.scrollIntoView({ block: "center" });
            }
          }}
          className="theme-overlay-surface fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border theme-overlay-shadow duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom motion-reduce:animate-none"
        >
          <DialogDescription className="sr-only">Choose a tool, open a utility, or leave the editor.</DialogDescription>
          <span aria-hidden className="theme-dev-rail-divider mx-auto mt-1.5 h-1 w-9 shrink-0 rounded-full" />
          <div className="flex shrink-0 items-center gap-2 px-3 py-1.5">
            <DialogTitle className={`${GROUP_CAPTION_CLASS} px-1`}>Tools</DialogTitle>
            <DialogPrimitive.Close aria-label="Close tools menu" className={`${ICON_BUTTON_CLASS} ml-auto`}><Icon icon="lucide:x" size={15} /></DialogPrimitive.Close>
          </div>
          <nav aria-label="Dev mode tools menu" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-2">
            <SheetToolList groups={groups} activeTab={activeTab} isToolsSection={isToolsSection} activeRowRef={activeRowRef} onTabChange={closeThen(onTabChange)} />
          </nav>
          <div className="theme-divider shrink-0 border-t px-3 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div role="group" aria-label="Site sections" className="flex flex-col gap-0.5">
              <span aria-hidden className={`${GROUP_CAPTION_CLASS} px-3 pb-1 pt-1`}>More</span>
              <button type="button" ref={changeLogActive ? (activeRowRef as RefObject<HTMLButtonElement>) : undefined} disabled={changeLogLockReason !== null} aria-disabled={changeLogLockReason !== null ? "true" : undefined} title={changeLogLockReason ?? undefined} aria-current={changeLogActive ? "page" : undefined} data-state={changeLogActive ? "active" : "inactive"} onClick={() => closeThen(onPrimaryTabChange)("change-log")} className={SHEET_TAB_CLASS}>Change log</button>
              {DEV_UTILITIES.map((utility) => <Link key={utility.href} href={utility.href} className={SHEET_TAB_CLASS}><Icon icon={utility.icon} size={16} className="theme-accent-emphasis shrink-0" />{utility.label}</Link>)}
              <button type="button" onClick={() => closeThen(onLeave)(undefined)} className={SHEET_TAB_CLASS}><Icon icon="lucide:x" size={16} className="shrink-0" />Leave editor</button>
            </div>
            <div role="group" aria-label="Session" className="mt-1 flex items-center gap-2 px-3 pt-2">{session}</div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
