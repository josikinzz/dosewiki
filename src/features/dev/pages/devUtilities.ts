import { roleMeetsFloor, type AppRole, type RoleFloor } from "@/lib/auth/roles";

export type DevUtility = { href: string; label: string; detail: string; icon: string; role: RoleFloor };

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

export function devUtilitiesFor(role: AppRole | null | undefined): readonly DevUtility[] {
  return DEV_UTILITIES.filter((utility) => roleMeetsFloor(role, utility.role));
}
