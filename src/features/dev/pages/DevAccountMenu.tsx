"use client";

import { useState } from "react";

import { Icon } from "@/components/common/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { guardedLinkProps, MENU_ROW_CLASS, MenuChevron, RAIL_TAB_CLASS } from "./DevModeToolRail";
import type { DevUtility } from "./devUtilities";

/** Up to two letters from the member's name, or the first of their email. */
export function accountInitials(label: string): string {
  const words = label.replace(/@.*$/, "").split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? `${words[0][0]}${words[words.length - 1][0]}` : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/** The member's initials on the chrome-rail material; decoration beside a written name. */
export function AccountAvatar({ label, image, className }: { label: string; image?: string | null; className?: string }) {
  // A dead image URL falls back to the initials instead of a broken glyph.
  const [failed, setFailed] = useState(false);
  return (
    <span aria-hidden className={cn("theme-dev-avatar inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold", className)}>
      {image && !failed ? (
        // A remote account image; the Next image optimizer has no host allowlist
        // for it. `onError` is the image's load event, not a pointer handler.
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/no-noninteractive-element-interactions
        <img src={image} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : accountInitials(label)}
    </span>
  );
}

export type DevAccountMenuProps = {
  userLabel: string;
  userEmail?: string | null;
  roleName: string;
  /** What this role may do, said once in the menu header ("You can edit articles."). */
  ability: string;
  /** The utility routes this role may open. */
  utilities: readonly DevUtility[];
  /** Only for a session image; initials otherwise. */
  userImage?: string | null;
  onShowShortcuts: () => void;
  /** Opens a utility route once the unsaved-work registry agrees. */
  onOpenHref?: (href: string) => void;
  onSignOut: () => void;
};

/**
 * Who is signed in, and the things that belong to the session rather than to
 * a tool: the keyboard sheet, the developer utilities (UI kit, Theme lab) and
 * Sign out. One trigger replaces a row of unlabeled icons; the trigger still
 * names the member and their role, so the rail always says whose edits these
 * are.
 */
export function DevAccountMenu({
  userLabel,
  userEmail,
  roleName,
  ability,
  utilities,
  userImage,
  onShowShortcuts,
  onOpenHref,
  onSignOut,
}: DevAccountMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" title={`Signed in. ${ability}`} className={cn(RAIL_TAB_CLASS, "max-w-[16rem] gap-2 pl-1")}>
          <AccountAvatar label={userLabel} image={userImage} />
          <span className="sr-only">{`Signed in as ${userLabel}, ${roleName}`}</span>
          <span aria-hidden className="theme-dev-rail-user hidden min-w-0 truncate font-semibold 2xl:inline">{userLabel}</span>
          <span aria-hidden className="theme-text-muted text-xs font-medium">{roleName}</span>
          <MenuChevron open={open} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label="Account" className="w-72 p-1.5 motion-reduce:animate-none">
        <div className="flex items-start gap-3 px-2.5 pb-2.5 pt-2">
          <AccountAvatar label={userLabel} image={userImage} className="h-9 w-9 text-sm" />
          <div className="min-w-0">
            <p className="theme-text-primary truncate text-sm font-semibold">{userLabel}</p>
            {userEmail && userEmail !== userLabel ? <p className="theme-text-muted truncate text-xs">{userEmail}</p> : null}
            <p className="theme-text-secondary mt-1.5 text-xs leading-snug">
              <span className="font-semibold">{roleName}.</span> {ability}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onShowShortcuts} className={MENU_ROW_CLASS}>
          <Icon icon="lucide:keyboard" size={16} className="theme-dev-tool-glyph" />
          Keyboard shortcuts
          <kbd className="theme-dev-kbd ml-auto">?</kbd>
        </DropdownMenuItem>
        {utilities.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup aria-label="Developer utilities">
              <DropdownMenuLabel className="px-2.5">Utilities</DropdownMenuLabel>
              {utilities.map((utility) => (
                <DropdownMenuItem key={utility.href} asChild className={cn(MENU_ROW_CLASS, "items-start")}>
                  <a {...guardedLinkProps(utility.href, onOpenHref)}>
                    <Icon icon={utility.icon} size={16} className="theme-dev-tool-glyph mt-0.5" />
                    <span className="flex min-w-0 flex-col">
                      <span>{utility.label}</span>
                      <span className="theme-text-muted text-xs font-normal leading-snug">{utility.detail}</span>
                    </span>
                  </a>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut} className={MENU_ROW_CLASS}>
          <Icon icon="lucide:log-out" size={16} className="theme-dev-tool-glyph" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
