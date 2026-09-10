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

export const RISK_LEVEL_CONFIG: Record<RiskLevel, { label: string; badgeClass: string; tone: string }> = {
  extremely_low: { label: "Extremely Low", badgeClass: "theme-evidence-surface", tone: "emerald" },
  low: { label: "Low", badgeClass: "theme-evidence-surface", tone: "green" },
  moderate: { label: "Moderate", badgeClass: "theme-semantic-caution-badge", tone: "yellow" },
  high: { label: "High", badgeClass: "theme-semantic-unsafe-badge", tone: "orange" },
  extremely_high: { label: "Extremely High", badgeClass: "theme-semantic-danger-badge", tone: "rose" },
};

export const CARCINOGENICITY_LEVEL_CONFIG: Record<CarcinogenicityLevel, { label: string; badgeClass: string; tone: string }> = {
  confirmed: { label: "Confirmed", badgeClass: "theme-semantic-danger-badge", tone: "rose" },
  probable: { label: "Probable", badgeClass: "theme-semantic-unsafe-badge", tone: "orange" },
  possible: { label: "Possible", badgeClass: "theme-semantic-caution-badge", tone: "yellow" },
  no_evidence: { label: "No Evidence", badgeClass: "theme-evidence-surface", tone: "emerald" },
  unknown: { label: "Unknown", badgeClass: "theme-badge-surface", tone: "white" },
};

export const EVIDENCE_LEVEL_CONFIG: Record<EvidenceLevel, { label: string; color: string }> = {
  none: { label: "None", color: "text-[color:var(--theme-semantic-success-badge-text)]" },
  negative: { label: "Negative", color: "text-[color:var(--theme-semantic-success-badge-text)]" },
  limited: { label: "Limited", color: "text-[color:var(--theme-semantic-caution-badge-text)]" },
  positive: { label: "Positive", color: "text-[color:var(--theme-semantic-danger-badge-text)]" },
};
