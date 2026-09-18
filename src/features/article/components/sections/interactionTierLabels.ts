import { msg } from "@/i18n/messages";

/**
 * The three TripSit interaction tiers, kept in a plain-TypeScript module so
 * the glossary drafter reads the badge wording without importing the
 * interactions section. Order is the render order of the section. `msg` is
 * the identity: renderers translate a label with `t(label)`.
 */
export const INTERACTION_TIERS = [
  { key: "dangerous", label: msg("Dangerous") },
  { key: "unsafe", label: msg("Unsafe") },
  { key: "caution", label: msg("Caution") },
] as const;
