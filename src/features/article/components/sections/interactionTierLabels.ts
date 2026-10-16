import { msg } from "@/i18n/messages";

export const INTERACTION_TIERS = [
  { key: "dangerous", label: msg("Dangerous") },
  { key: "unsafe", label: msg("Unsafe") },
  { key: "caution", label: msg("Caution") },
] as const;
