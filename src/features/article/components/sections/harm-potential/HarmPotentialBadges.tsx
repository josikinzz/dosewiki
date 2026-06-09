import type { RiskLevel, CarcinogenicityLevel, EvidenceLevel } from "@/schema";

/**
 * Severity level badge configuration
 */
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
  none: { label: "None", color: "text-emerald-300" },
  negative: { label: "Negative", color: "text-green-300" },
  limited: { label: "Limited", color: "text-yellow-300" },
  positive: { label: "Positive", color: "text-rose-300" },
};

/**
 * Severity level badge component
 */
export function RiskLevelBadge({ level }: { level: RiskLevel | null | undefined }) {
  if (!level) return null;
  const config = RISK_LEVEL_CONFIG[level];
  if (!config) return null;
  return (
    <span
      className={`theme-status-badge inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.badgeClass}`}
      data-badge-tone={config.tone}
    >
      {config.label}
    </span>
  );
}

/**
 * Carcinogenicity level badge component
 */
export function CarcinogenicityLevelBadge({ level }: { level: CarcinogenicityLevel | null | undefined }) {
  if (!level) return null;
  const config = CARCINOGENICITY_LEVEL_CONFIG[level];
  if (!config) return null;
  return (
    <span
      className={`theme-status-badge inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.badgeClass}`}
      data-badge-tone={config.tone}
    >
      {config.label}
    </span>
  );
}

/**
 * Evidence level indicator
 */
export function EvidenceLevelIndicator({ level, label }: { level: EvidenceLevel | null | undefined; label: string }) {
  if (!level) return null;
  const config = EVIDENCE_LEVEL_CONFIG[level];
  if (!config) return null;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="theme-text-muted">{label}</span>
      <span className={config.color}>{config.label}</span>
    </div>
  );
}
