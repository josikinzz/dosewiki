import { StatusBadge, type StatusBadgeTone } from "@/components/common/StatusBadge";
import type { RiskLevel, CarcinogenicityLevel, EvidenceLevel } from "@/schema";
import {
  CARCINOGENICITY_LEVEL_CONFIG,
  EVIDENCE_LEVEL_CONFIG,
  RISK_LEVEL_CONFIG,
} from "./harmPotentialLabels";

/**
 * Severity level badge component
 */
export function RiskLevelBadge({ level }: { level: RiskLevel | null | undefined }) {
  if (!level) return null;
  const config = RISK_LEVEL_CONFIG[level];
  if (!config) return null;
  return (
    <StatusBadge tone={config.tone as StatusBadgeTone} className={config.badgeClass}>
      {config.label}
    </StatusBadge>
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
    <StatusBadge tone={config.tone as StatusBadgeTone} className={config.badgeClass}>
      {config.label}
    </StatusBadge>
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
