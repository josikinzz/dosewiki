import {
  warningBannerPresetState,
  type WarningBannerPreset,
  type WarningBannerPresetState,
  type WarningBannerTone,
} from "@/data/substanceWarningBanners";
import type { EditorStatusPillTone } from "@/features/dev/components";

export const TONE_LABEL: Record<WarningBannerTone, string> = {
  danger: "Danger",
  unsafe: "Unsafe",
  caution: "Caution",
};

export const STATE_PILL_TONE: Record<WarningBannerPresetState, EditorStatusPillTone> = {
  live: "success",
  dormant: "caution",
  off: "neutral",
};

export function countNoun(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

type Scope = Pick<WarningBannerPreset, "enabled" | "allSubstances" | "enabledSlugs">;

export function presetStateLabel(preset: Scope): string {
  const state = warningBannerPresetState(preset);
  if (state === "off") return "Off";
  if (state === "dormant") return "Renders nowhere";
  return preset.allSubstances ? "Live everywhere" : `Live on ${countNoun(preset.enabledSlugs.length, "substance")}`;
}

export function presetReachLabel(preset: Scope): string {
  return preset.allSubstances ? "Every article" : countNoun(preset.enabledSlugs.length, "substance");
}
