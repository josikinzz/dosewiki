"use client";

import Link from "next/link";

import { Icon } from "@/components/common/Icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TOUCH_ICON } from "@/components/ui/touchTargets";

/**
 * The developer utilities that are routes of their own rather than tool tabs. Both
 * live under the `/dev` prefix, so they share the shell's role gate and its flavor gate.
 */
export const DEV_UTILITIES: readonly { href: string; label: string; detail: string; icon: string }[] = [
  {
    href: "/dev/kit",
    label: "UI kit",
    detail: "Component catalog and stories",
    icon: "lucide:layout-grid",
  },
  {
    href: "/dev/themes",
    label: "Theme lab",
    detail: "Full-page theme editor",
    icon: "lucide:palette",
  },
];

/**
 * Wrench button in the chrome cluster that opens a short menu of the developer
 * utility routes. Until this existed, `/dev/kit` and `/dev/themes` were reachable
 * only by typed URL.
 */
export function DevUtilitiesMenu() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Utilities"
          aria-label="Utilities"
          className={`theme-dev-rail-button flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors duration-200 motion-reduce:transition-none ${TOUCH_ICON}`}
        >
          <Icon icon="lucide:wrench" size={15} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Utilities" className="w-60 p-1.5">
        <nav aria-label="Developer utilities">
          <ul className="flex flex-col gap-0.5">
            {DEV_UTILITIES.map((utility) => (
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
