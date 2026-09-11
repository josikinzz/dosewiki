/**
 * Harm-potential badge configuration: the reader-facing level labels together
 * with the classes and tones the badges render them in. Plain TypeScript, so a
 * script can read the labels without importing a React component, following the
 * split described in `schema/substance/legalStatuses.ts`.
 *
 * `antibiotic_function.level` has no config of its own: it shares the
 * carcinogenicity key set, and `ToxicitySubsection` reads its label from
 * `CARCINOGENICITY_LEVEL_CONFIG`.
 */
import type { RiskLevel, CarcinogenicityLevel, EvidenceLevel } from "@/schema";
import { msg } from "@/i18n/messages";

export const RISK_LEVEL_CONFIG: Record<RiskLevel, { label: string; badgeClass: string; tone: string }> = {
  extremely_low: { label: msg("Extremely Low"), badgeClass: "theme-evidence-surface", tone: "emerald" },
  low: { label: msg("Low"), badgeClass: "theme-evidence-surface", tone: "green" },
  moderate: { label: msg("Moderate"), badgeClass: "theme-semantic-caution-badge", tone: "yellow" },
  high: { label: msg("High"), badgeClass: "theme-semantic-unsafe-badge", tone: "orange" },
  extremely_high: { label: msg("Extremely High"), badgeClass: "theme-semantic-danger-badge", tone: "rose" },
};

export const CARCINOGENICITY_LEVEL_CONFIG: Record<CarcinogenicityLevel, { label: string; badgeClass: string; tone: string }> = {
  confirmed: { label: msg("Confirmed"), badgeClass: "theme-semantic-danger-badge", tone: "rose" },
  probable: { label: msg("Probable"), badgeClass: "theme-semantic-unsafe-badge", tone: "orange" },
  possible: { label: msg("Possible"), badgeClass: "theme-semantic-caution-badge", tone: "yellow" },
  no_evidence: { label: msg("No Evidence"), badgeClass: "theme-evidence-surface", tone: "emerald" },
  unknown: { label: msg("Unknown"), badgeClass: "theme-badge-surface", tone: "white" },
};

export const EVIDENCE_LEVEL_CONFIG: Record<EvidenceLevel, { label: string; color: string }> = {
  none: { label: msg("None"), color: "text-[color:var(--theme-semantic-success-badge-text)]" },
  negative: { label: msg("Negative"), color: "text-[color:var(--theme-semantic-success-badge-text)]" },
  limited: { label: msg("Limited"), color: "text-[color:var(--theme-semantic-caution-badge-text)]" },
  positive: { label: msg("Positive"), color: "text-[color:var(--theme-semantic-danger-badge-text)]" },
};
