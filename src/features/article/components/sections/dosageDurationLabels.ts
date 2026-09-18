import { msg } from "@/i18n/messages";

/**
 * Dose-tier and duration-stage row labels, kept in a plain-TypeScript module so
 * scripts can read the wording without importing a React component. Same split,
 * and the same reason, as `schema/substance/legalStatuses.ts`: the translation
 * registry export needs the reader-facing strings, not the renderer.
 *
 * Order is the render order of the dosage and duration tables. `msg` is the
 * identity: renderers translate a label with `t(label)`.
 */
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
