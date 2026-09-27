import { roleMeetsFloor, type AppRole, type RoleFloor } from "@/lib/auth/roles";

export type DevUtility = { href: string; label: string; detail: string; icon: string; role: RoleFloor };

/**
 * The developer utilities that are routes of their own rather than tool tabs. Both
 * live under the `/dev` prefix and open from the account menu (and the phone
 * tool sheet) and share its flavor gate; each page also checks
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
