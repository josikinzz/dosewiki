import type { IconName } from "@/components/common/Icon";

export const DEFAULT_CATEGORY_ICON: IconName = "lucide:layers";

const CATEGORY_ICON_MAP: Record<string, IconName> = {
  psychedelic: "game-icons:oily-spiral",
  psychedelics: "game-icons:oily-spiral",
  dissociative: "lucide:unlink",
  dissociatives: "lucide:unlink",
  deliriant: "tabler:spider",
  deliriants: "tabler:spider",
  entactogen: "lucide:heart",
  entactogens: "lucide:heart",
  empathogen: "lucide:heart",
  empathogens: "lucide:heart",
  stimulant: "lucide:zap",
  stimulants: "lucide:zap",
  opioid: "mynaui:danger-hexagon",
  opioids: "mynaui:danger-hexagon",
  gabaergic: "streamline:smiley-smirk",
  gabaergics: "streamline:smiley-smirk",
  cannabinoid: "lucide:cannabis",
  cannabinoids: "lucide:cannabis",
  nootropic: "lucide:lightbulb",
  nootropics: "lucide:lightbulb",
  antidepressant: "fluent:emoji-add-16-regular",
  antidepressants: "fluent:emoji-add-16-regular",
  antipsychotic: "mingcute:anchor-fill",
  antipsychotics: "mingcute:anchor-fill",
  hallucinogen: "lucide:shell",
  hallucinogens: "lucide:shell",
  "a-typical hallucinogen": "lucide:shell",
  "a-typical hallucinogens": "lucide:shell",
  "a-typical-hallucinogen": "lucide:shell",
  "a-typical-hallucinogens": "lucide:shell",
  "atypical hallucinogen": "lucide:shell",
  "atypical hallucinogens": "lucide:shell",
  "atypical-hallucinogen": "lucide:shell",
  "atypical-hallucinogens": "lucide:shell",
  "anabolic-steroid": "lucide:dumbbell",
  "anabolic steroids": "lucide:dumbbell",
  supplement: "lucide:sprout",
  supplements: "lucide:sprout",
  barbiturate: "lucide:beaker",
  barbiturates: "lucide:beaker",
  benzodiazepine: "lucide:pill",
  benzodiazepines: "lucide:pill",
  sedative: "lucide:bed-double",
  sedatives: "lucide:bed-double",
  depressant: "lucide:moon",
  depressants: "lucide:moon",
  miscellaneous: "lucide:shapes",
  misc: "lucide:shapes",
  "research-chemical": "lucide:flask-conical",
  "research-chemicals": "lucide:flask-conical",
  "research chemical": "lucide:flask-conical",
  "research chemicals": "lucide:flask-conical",
  "habit-forming": "lucide:repeat-2",
  "habit forming": "lucide:repeat-2",
  common: "lucide:swatch-book",
  chemical: "solar:benzene-ring-linear",
  mechanism: "lucide:cog",
};

export function getCategoryIcon(key: string): IconName {
  const trimmedKey = key.trim();

  if (trimmedKey.includes(":")) {
    return trimmedKey;
  }

  return CATEGORY_ICON_MAP[trimmedKey] ?? DEFAULT_CATEGORY_ICON;
}
