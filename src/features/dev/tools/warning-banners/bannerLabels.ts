import {
  warningBannerPresetState,
  type WarningBannerPreset,
  type WarningBannerPresetState,
  type WarningBannerTone,
} from "@/data/substanceWarningBanners";
import type { EditorStatusPillTone } from "@/features/dev/components";

/**
 * The words the Banner Studio uses for a preset's tone and its state, in one
 * place so the Presets list, the open preset, Coverage and Rollout say the
 * same thing about the same preset.
 */

export const TONE_LABEL: Record<WarningBannerTone, string> = {
  danger: "Danger",
  unsafe: "Unsafe",
  caution: "Caution",
};

/**
 * Enablement state only. Grey for off because off is the correct default and
 * colouring it red would train an editor that the safe state looks broken;
 * green appears for live and nowhere else in the tool. Severity colour never
 * reaches a status position.
 */
export const STATE_PILL_TONE: Record<WarningBannerPresetState, EditorStatusPillTone> = {
  live: "success",
  dormant: "caution",
  off: "neutral",
};

export function countNoun(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

type Scope = Pick<WarningBannerPreset, "enabled" | "allSubstances" | "enabledSlugs">;

/** A preset's state as a short pill: "Live on 5 substances", "Live everywhere", "Renders nowhere", "Off". */
export function presetStateLabel(preset: Scope): string {
  const state = warningBannerPresetState(preset);
  if (state === "off") return "Off";
  if (state === "dormant") return "Renders nowhere";
  return preset.allSubstances ? "Live everywhere" : `Live on ${countNoun(preset.enabledSlugs.length, "substance")}`;
}

/** How far a preset's list reaches, whatever its switch says: "5 substances" or "Every article". */
export function presetReachLabel(preset: Scope): string {
  return preset.allSubstances ? "Every article" : countNoun(preset.enabledSlugs.length, "substance");
}
