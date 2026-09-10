/**
 * Dose-tier and duration-stage row labels, kept in a plain-TypeScript module so
 * scripts can read the wording without importing a React component. Same split,
 * and the same reason, as `schema/substance/legalStatuses.ts`: the translation
 * registry export needs the reader-facing strings, not the renderer.
 *
 * Order is the render order of the dosage and duration tables.
 */
export const DOSE_TIERS = [
  { key: "threshold", label: "Threshold" },
  { key: "light", label: "Light" },
  { key: "moderate", label: "Moderate" },
  { key: "strong", label: "Strong" },
  { key: "heavy", label: "Heavy" },
] as const;

export const DURATION_STAGES = [
  { key: "onset", label: "Onset" },
  { key: "come_up", label: "Come Up" },
  { key: "peak", label: "Peak" },
  { key: "offset", label: "Offset" },
  { key: "after_effects", label: "After Effects" },
  { key: "total_duration", label: "Total" },
] as const;
