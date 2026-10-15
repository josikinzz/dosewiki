import { msg } from "@/i18n/messages";

export const DOSE_TIERS = [
  { key: "threshold", label: msg("Threshold") },
  { key: "light", label: msg("Light") },
  { key: "moderate", label: msg("Moderate") },
  { key: "strong", label: msg("Strong") },
  { key: "heavy", label: msg("Heavy") },
] as const;

export const DURATION_STAGES = [
  { key: "onset", label: msg("Onset") },
  { key: "come_up", label: msg("Come Up") },
  { key: "peak", label: msg("Peak") },
  { key: "offset", label: msg("Offset") },
  { key: "after_effects", label: msg("After Effects") },
  { key: "total_duration", label: msg("Total") },
] as const;
