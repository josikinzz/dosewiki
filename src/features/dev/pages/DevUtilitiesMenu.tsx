"use client";

import Link from "next/link";

import { Icon } from "@/components/common/Icon";
import { roleMeetsFloor, type AppRole, type RoleFloor } from "@/lib/auth/roles";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RAIL_ICON_BUTTON_CLASS } from "./DevModeToolRail";

export type DevUtility = { href: string; label: string; detail: string; icon: string; role: RoleFloor };

/**
 * The developer utilities that are routes of their own rather than tool tabs. Both
 * live under the `/dev` prefix and share its flavor gate; each page also checks
 * `role`, the same floor the menu filters on, so nobody is offered a bounce.
 */
export const DEV_UTILITIES: readonly DevUtility[] = [
  {
    href: "/dev/kit",
    label: "UI kit",
    detail: "Component catalog and stories",
    icon: "lucide:layout-grid",
    role: "editor",
  },
  {
    href: "/dev/themes",
    label: "Theme lab",
    detail: "Full-page theme editor",
    icon: "lucide:palette",
    role: "editor",
  },
];

/** The utilities this role may open. */
export function devUtilitiesFor(role: AppRole | null | undefined): readonly DevUtility[] {
  return DEV_UTILITIES.filter((utility) => roleMeetsFloor(role, utility.role));
}

/**
 * Utilities button in the chrome cluster that opens a short menu of the
 * developer utility routes. Until this existed, `/dev/kit` and `/dev/themes`
 * were reachable only by typed URL. Its icon is not the wrench: the wrench is
 * the rail's Dev Tools mark, and two wrenches side by side read as one thing.
 */
export function DevUtilitiesMenu({ utilities = DEV_UTILITIES }: { utilities?: readonly DevUtility[] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Utilities"
          aria-label="Utilities"
          className={RAIL_ICON_BUTTON_CLASS}
        >
          <Icon icon="lucide:blocks" size={15} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Utilities" className="w-60 p-1.5">
        <nav aria-label="Developer utilities">
          <ul className="flex flex-col gap-0.5">
            {utilities.map((utility) => (
              <li key={utility.href}>
                <Link
                  href={utility.href}
                  className="theme-dev-rail-tab flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors duration-200 motion-reduce:transition-none"
                >
                  <Icon icon={utility.icon} size={16} className="theme-accent-emphasis mt-0.5 shrink-0" />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[0.8125rem] font-semibold leading-tight">{utility.label}</span>
                    <span className="theme-text-muted text-xs leading-snug">{utility.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </PopoverContent>
    </Popover>
  );
}
