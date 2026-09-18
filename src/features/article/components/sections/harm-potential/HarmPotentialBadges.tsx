import { StatusBadge, type StatusBadgeTone } from "@/components/common/StatusBadge";
import type { RiskLevel, CarcinogenicityLevel, EvidenceLevel } from "@/schema";
import {
  CARCINOGENICITY_LEVEL_CONFIG,
  EVIDENCE_LEVEL_CONFIG,
  RISK_LEVEL_CONFIG,
} from "./harmPotentialLabels";
import { useT } from "@/i18n/client";

/**
 * Severity level badge component
 */
export function RiskLevelBadge({ level }: { level: RiskLevel | null | undefined }) {
  const t = useT();
  if (!level) return null;
  const config = RISK_LEVEL_CONFIG[level];
  if (!config) return null;
  return (
    <StatusBadge tone={config.tone as StatusBadgeTone} className={config.badgeClass}>
      {t(config.label)}
    </StatusBadge>
  );
}

/**
 * Carcinogenicity level badge component
 */
export function CarcinogenicityLevelBadge({ level }: { level: CarcinogenicityLevel | null | undefined }) {
  const t = useT();
  if (!level) return null;
  const config = CARCINOGENICITY_LEVEL_CONFIG[level];
  if (!config) return null;
  return (
    <StatusBadge tone={config.tone as StatusBadgeTone} className={config.badgeClass}>
      {t(config.label)}
    </StatusBadge>
  );
}

/**
 * Evidence level indicator
 */
export function EvidenceLevelIndicator({ level, label }: { level: EvidenceLevel | null | undefined; label: string }) {
  const t = useT();
  if (!level) return null;
  const config = EVIDENCE_LEVEL_CONFIG[level];
  if (!config) return null;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="theme-text-muted">{label}</span>
      <span className={config.color}>{t(config.label)}</span>
    </div>
  );
}
