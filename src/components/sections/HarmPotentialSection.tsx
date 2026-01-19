import { memo } from "react";
import { Icon } from "../common/Icon";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import { Bullet } from "../common/Bullet";
import type { SubstanceArticle, RiskLevel, CarcinogenicityLevel, EvidenceLevel } from "../../schema";

interface HarmPotentialSectionProps {
  article: SubstanceArticle;
}

/**
 * Severity level badge configuration
 */
const RISK_LEVEL_CONFIG: Record<RiskLevel, { label: string; color: string; bgColor: string }> = {
  extremely_low: { label: "Extremely Low", color: "text-emerald-300", bgColor: "bg-emerald-500/20" },
  low: { label: "Low", color: "text-green-300", bgColor: "bg-green-500/20" },
  moderate: { label: "Moderate", color: "text-yellow-300", bgColor: "bg-yellow-500/20" },
  high: { label: "High", color: "text-orange-300", bgColor: "bg-orange-500/20" },
  extremely_high: { label: "Extremely High", color: "text-rose-300", bgColor: "bg-rose-500/20" },
};

const CARCINOGENICITY_LEVEL_CONFIG: Record<CarcinogenicityLevel, { label: string; color: string; bgColor: string }> = {
  confirmed: { label: "Confirmed", color: "text-rose-300", bgColor: "bg-rose-500/20" },
  probable: { label: "Probable", color: "text-orange-300", bgColor: "bg-orange-500/20" },
  possible: { label: "Possible", color: "text-yellow-300", bgColor: "bg-yellow-500/20" },
  no_evidence: { label: "No Evidence", color: "text-emerald-300", bgColor: "bg-emerald-500/20" },
  unknown: { label: "Unknown", color: "text-white/60", bgColor: "bg-white/10" },
};

const EVIDENCE_LEVEL_CONFIG: Record<EvidenceLevel, { label: string; color: string }> = {
  none: { label: "None", color: "text-emerald-300" },
  negative: { label: "Negative", color: "text-green-300" },
  limited: { label: "Limited", color: "text-yellow-300" },
  positive: { label: "Positive", color: "text-rose-300" },
};

/**
 * Severity level badge component
 */
function RiskLevelBadge({ level }: { level: RiskLevel | null | undefined }) {
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
function CarcinogenicityLevelBadge({ level }: { level: CarcinogenicityLevel | null | undefined }) {
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
function EvidenceLevelIndicator({ level, label }: { level: EvidenceLevel | null | undefined; label: string }) {
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

// Type for old schema format
interface OldHarmPotential {
  addiction_liability?: string;
  dependence_liability?: string;
  toxicity?: {
    ld50?: string;
    organ_toxicity?: string;
    carcinogenicity?: string;
    other?: string;
  };
  risks?: {
    psychosis?: string;
    seizure?: string;
    self_harm?: string;
    other?: string[];
  };
}

export const HarmPotentialSection = memo(function HarmPotentialSection({
  article,
}: HarmPotentialSectionProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hp = article.harm_potential as any;
  if (!hp) return null;

  // Detect old schema (has addiction_liability at top level or toxicity.ld50 is string)
  const isOldSchema =
    typeof hp.addiction_liability === "string" ||
    typeof hp.dependence_liability === "string" ||
    typeof hp.toxicity?.ld50 === "string" ||
    typeof hp.risks?.psychosis === "string";

  // Normalize addiction
  const addiction = isOldSchema
    ? {
        psychological: { level: null as RiskLevel | null, description: (hp as OldHarmPotential).addiction_liability || "" },
        physical_dependence: { level: null as RiskLevel | null, description: (hp as OldHarmPotential).dependence_liability || "" },
      }
    : hp.addiction;

  // Normalize ld50
  const ld50Array = Array.isArray(hp.toxicity?.ld50) ? hp.toxicity.ld50 : [];
  const ld50String = typeof hp.toxicity?.ld50 === "string" ? hp.toxicity.ld50 : "";

  // Normalize organ_toxicity
  const organToxicityArray = Array.isArray(hp.toxicity?.organ_toxicity) ? hp.toxicity.organ_toxicity : [];
  const organToxicityString = typeof hp.toxicity?.organ_toxicity === "string" ? hp.toxicity.organ_toxicity : "";

  // Normalize carcinogenicity
  const carcinogenicity =
    typeof hp.toxicity?.carcinogenicity === "string"
      ? { level: null as CarcinogenicityLevel | null, evidence: null, description: hp.toxicity.carcinogenicity }
      : hp.toxicity?.carcinogenicity || { level: null, evidence: null, description: "" };

  // Normalize antibiotic_function (new schema only)
  const antibioticFunction = hp.toxicity?.antibiotic_function || { level: null, description: "" };

  // Normalize toxicity other
  const toxicityOther = typeof hp.toxicity?.other === "string" ? hp.toxicity.other : "";

  // Normalize risks
  const psychosis =
    typeof hp.risks?.psychosis === "string"
      ? { level: null as RiskLevel | null, description: hp.risks.psychosis }
      : hp.risks?.psychosis || { level: null, description: "" };
  const seizure =
    typeof hp.risks?.seizure === "string"
      ? { level: null as RiskLevel | null, description: hp.risks.seizure }
      : hp.risks?.seizure || { level: null, description: "" };
  const selfHarm =
    typeof hp.risks?.self_harm === "string"
      ? { level: null as RiskLevel | null, description: hp.risks.self_harm }
      : hp.risks?.self_harm || { level: null, description: "" };
  const risksOther = Array.isArray(hp.risks?.other) ? hp.risks.other : [];

  // Check for content
  const hasAddiction =
    (addiction?.psychological?.description || "").trim().length > 0 ||
    (addiction?.physical_dependence?.description || "").trim().length > 0;

  const hasLD50 = ld50Array.length > 0 || ld50String.trim().length > 0;
  const hasOrganToxicity = organToxicityArray.length > 0 || organToxicityString.trim().length > 0;
  const hasCarcinogenicity =
    (carcinogenicity?.description || "").trim().length > 0 || carcinogenicity?.level != null;
  const hasAntibioticFunction =
    (antibioticFunction?.description || "").trim().length > 0 || antibioticFunction?.level != null;
  const hasToxicityOther = toxicityOther.trim().length > 0;

  const hasToxicity = hasLD50 || hasOrganToxicity || hasCarcinogenicity || hasAntibioticFunction || hasToxicityOther;

  const hasRisks =
    (psychosis?.description || "").trim().length > 0 ||
    (seizure?.description || "").trim().length > 0 ||
    (selfHarm?.description || "").trim().length > 0 ||
    risksOther.length > 0;

  if (!hasAddiction && !hasToxicity && !hasRisks) {
    return null;
  }

  return (
    <SectionCard delay={0}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon="lucide:ambulance" label="Harm Potential" />
        Harm Potential
      </h2>

      {/* Addiction & Toxicity in single column */}
      {(hasAddiction || hasToxicity) && (
        <div className="flex flex-col gap-4">
          {/* Addiction & Dependence */}
          {hasAddiction && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
                <Icon icon="jam:repeat" size={20} className="text-rose-300" />
                Addiction & Dependence
              </h3>
              <div className="flex flex-col gap-3">
                {addiction?.psychological?.description && (
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">Psychological Addiction</span>
                      <RiskLevelBadge level={addiction.psychological.level} />
                    </div>
                    <p className="mt-1 text-sm text-white/80">{addiction.psychological.description}</p>
                  </div>
                )}
                {addiction?.physical_dependence?.description && (
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">Physical Dependence</span>
                      <RiskLevelBadge level={addiction.physical_dependence.level} />
                    </div>
                    <p className="mt-1 text-sm text-white/80">{addiction.physical_dependence.description}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Toxicity */}
          {hasToxicity && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
                <Icon icon="healthicons:poison-24px" size={20} className="text-rose-300" />
                Toxicity
              </h3>
              <div className="flex flex-col gap-3">
                {/* LD50 - handle both string and array */}
                {hasLD50 && (
                  <div className="rounded-lg bg-white/5 p-3">
                    <span className="text-sm font-semibold text-white">LD50</span>
                    {ld50String ? (
                      <p className="mt-1 text-sm text-white/80">{ld50String}</p>
                    ) : ld50Array.length === 1 && !ld50Array[0].species ? (
                      <p className="mt-1 text-sm text-white/80">
                        {ld50Array[0].unit || `${ld50Array[0].value} ${ld50Array[0].unit}`}
                      </p>
                    ) : (
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="px-2 py-1 text-left text-white/60">Species</th>
                              <th className="px-2 py-1 text-left text-white/60">Route</th>
                              <th className="px-2 py-1 text-right text-white/60">Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ld50Array.map((entry: { species?: string; route?: string; value?: number | null; unit?: string }, idx: number) => (
                              <tr key={idx} className="border-b border-white/5">
                                <td className="px-2 py-1 text-white/80">{entry.species || "—"}</td>
                                <td className="px-2 py-1 text-white/80">{entry.route || "—"}</td>
                                <td className="px-2 py-1 text-right text-white/80">
                                  {entry.value != null ? `${entry.value} ${entry.unit}` : entry.unit || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Organ Toxicity - handle both string and array */}
                {hasOrganToxicity && (
                  <div className="rounded-lg bg-white/5 p-3">
                    <span className="text-sm font-semibold text-white">Organ Toxicity</span>
                    {organToxicityString ? (
                      <p className="mt-1 text-sm text-white/80">{organToxicityString}</p>
                    ) : (
                      <div className="mt-2 space-y-3">
                        {organToxicityArray.map((entry: { system?: string; findings?: string; mechanism?: string; notes?: string }, idx: number) => (
                          <div key={idx} className="rounded-lg bg-white/5 p-2">
                            {entry.system && <div className="font-medium text-white">{entry.system}</div>}
                            {entry.findings && <p className="mt-1 text-sm text-white/80">{entry.findings}</p>}
                            {entry.mechanism && (
                              <p className="mt-1 text-xs text-white/60">
                                <span className="font-medium">Mechanism:</span> {entry.mechanism}
                              </p>
                            )}
                            {entry.notes && <p className="mt-1 text-xs text-white/50 italic">{entry.notes}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Carcinogenicity */}
                {hasCarcinogenicity && (
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">Carcinogenicity</span>
                      <CarcinogenicityLevelBadge level={carcinogenicity?.level} />
                    </div>
                    {carcinogenicity?.description && (
                      <p className="mt-1 text-sm text-white/80">{carcinogenicity.description}</p>
                    )}
                    {/* Evidence breakdown (new schema only) */}
                    {carcinogenicity?.evidence && (
                      <div className="mt-2 rounded-lg bg-white/5 p-2 space-y-1">
                        <div className="text-xs font-medium text-white/60 mb-1">Evidence:</div>
                        <EvidenceLevelIndicator
                          level={carcinogenicity.evidence.human_epidemiological}
                          label="Human Epidemiological"
                        />
                        {carcinogenicity.evidence.animal_models && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-white/60">Animal Models</span>
                            <span className={EVIDENCE_LEVEL_CONFIG[carcinogenicity.evidence.animal_models.level || "none"]?.color || "text-white/60"}>
                              {carcinogenicity.evidence.animal_models.level
                                ? EVIDENCE_LEVEL_CONFIG[carcinogenicity.evidence.animal_models.level]?.label || "None"
                                : "None"}
                              {carcinogenicity.evidence.animal_models.species?.length > 0 && (
                                <span className="text-white/40 ml-1">
                                  ({carcinogenicity.evidence.animal_models.species.join(", ")})
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                        {carcinogenicity.evidence.in_vitro && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-white/60">In Vitro</span>
                            <span className="text-white/80">
                              {carcinogenicity.evidence.in_vitro.type}
                              {carcinogenicity.evidence.in_vitro.assay_type && (
                                <span className="text-white/40 ml-1">({carcinogenicity.evidence.in_vitro.assay_type})</span>
                              )}
                            </span>
                          </div>
                        )}
                        {carcinogenicity.evidence.mechanistic && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-white/60">Mechanistic</span>
                            <span className={EVIDENCE_LEVEL_CONFIG[carcinogenicity.evidence.mechanistic.level || "none"]?.color || "text-white/60"}>
                              {carcinogenicity.evidence.mechanistic.level
                                ? EVIDENCE_LEVEL_CONFIG[carcinogenicity.evidence.mechanistic.level]?.label || "None"
                                : "None"}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Antibiotic Function (new schema only) */}
                {hasAntibioticFunction && (
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">Antibiotic Function</span>
                      {antibioticFunction?.level && (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            CARCINOGENICITY_LEVEL_CONFIG[antibioticFunction.level as CarcinogenicityLevel]?.color || "text-white/60"
                          } ${CARCINOGENICITY_LEVEL_CONFIG[antibioticFunction.level as CarcinogenicityLevel]?.bgColor || "bg-white/10"}`}
                        >
                          {CARCINOGENICITY_LEVEL_CONFIG[antibioticFunction.level as CarcinogenicityLevel]?.label || antibioticFunction.level}
                        </span>
                      )}
                    </div>
                    {antibioticFunction?.description && (
                      <p className="mt-1 text-sm text-white/80">{antibioticFunction.description}</p>
                    )}
                  </div>
                )}

                {/* Other toxicity */}
                {hasToxicityOther && (
                  <div className="rounded-lg bg-white/5 p-3">
                    <span className="text-sm font-semibold text-white">Other</span>
                    <p className="mt-1 text-sm text-white/80">{toxicityOther}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Risks - single column */}
      {hasRisks && (
        <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
            <Icon icon="streamline:dangerous-zone-sign-remix" size={20} className="text-rose-300" />
            Risks
          </h3>
          <div className="flex flex-col gap-3">
            {psychosis?.description && (
              <div className="rounded-lg bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Psychosis</span>
                  <RiskLevelBadge level={psychosis.level} />
                </div>
                <p className="mt-1 text-sm text-white/80">{psychosis.description}</p>
              </div>
            )}
            {seizure?.description && (
              <div className="rounded-lg bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Seizure</span>
                  <RiskLevelBadge level={seizure.level} />
                </div>
                <p className="mt-1 text-sm text-white/80">{seizure.description}</p>
              </div>
            )}
            {selfHarm?.description && (
              <div className="rounded-lg bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Self-harm</span>
                  <RiskLevelBadge level={selfHarm.level} />
                </div>
                <p className="mt-1 text-sm text-white/80">{selfHarm.description}</p>
              </div>
            )}
            {risksOther.length > 0 && (
              <div className="rounded-lg bg-white/5 p-3">
                <span className="text-sm font-semibold text-white">Other Risks</span>
                <ul className="mt-1 space-y-1">
                  {risksOther.map((risk: string, idx: number) => (
                    <li key={idx} className="flex items-center gap-2 text-sm text-white/80">
                      <Bullet color="rose" />
                      {risk}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
});
