import type { IconName } from "@/components/common/Icon";
import type { RouteChromeIcon } from "@/types/navigation";
import { icons } from "@/utils/iconNames";

const SUBSTANCE_INDEX_ICON = "streamline-ultimate:science-molecule-strucutre-bold" satisfies IconName;

const ROUTE_CHROME_ICONS = {
  substances: SUBSTANCE_INDEX_ICON,
  effects: icons.subjectiveEffectIndex,
  replications: "hugeicons:camera-ai",
  reports: icons.fileSignature,
  about: icons.info,
  dev: "lucide:settings",
  github: "ph:github-logo-bold",
} satisfies Record<RouteChromeIcon, IconName>;

export function resolveRouteChromeIcon(icon: RouteChromeIcon): IconName {
  return ROUTE_CHROME_ICONS[icon];
}
