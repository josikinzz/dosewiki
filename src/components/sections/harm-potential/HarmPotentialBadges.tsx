import type { RiskLevel, CarcinogenicityLevel, EvidenceLevel } from "../../../schema";

/**
 * Severity level badge configuration
 */
export const RISK_LEVEL_CONFIG: Record<RiskLevel, { label: string; color: string; bgColor: string }> = {
  extremely_low: { label: "Extremely Low", color: "text-emerald-300", bgColor: "bg-emerald-500/20" },
  low: { label: "Low", color: "text-green-300", bgColor: "bg-green-500/20" },
  moderate: { label: "Moderate", color: "text-yellow-300", bgColor: "bg-yellow-500/20" },
  high: { label: "High", color: "text-orange-300", bgColor: "bg-orange-500/20" },
  extremely_high: { label: "Extremely High", color: "text-rose-300", bgColor: "bg-rose-500/20" },
};

export const CARCINOGENICITY_LEVEL_CONFIG: Record<CarcinogenicityLevel, { label: string; color: string; bgColor: string }> = {
  confirmed: { label: "Confirmed", color: "text-rose-300", bgColor: "bg-rose-500/20" },
  probable: { label: "Probable", color: "text-orange-300", bgColor: "bg-orange-500/20" },
  possible: { label: "Possible", color: "text-yellow-300", bgColor: "bg-yellow-500/20" },
  no_evidence: { label: "No Evidence", color: "text-emerald-300", bgColor: "bg-emerald-500/20" },
  unknown: { label: "Unknown", color: "text-white/60", bgColor: "bg-white/10" },
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
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.color} ${config.bgColor}`}>
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
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.color} ${config.bgColor}`}>
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
      <span className="text-white/60">{label}</span>
      <span className={config.color}>{config.label}</span>
    </div>
  );
}
