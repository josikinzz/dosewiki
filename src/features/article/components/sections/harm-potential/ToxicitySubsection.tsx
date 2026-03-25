import { useState } from "react";
import { Icon } from "@/components/common/Icon";
import { ExpandButton } from "@/components/common/ExpandButton";
import { NormalizedHarmPotential } from "./HarmPotentialUtils";
import type { CarcinogenicityLevel } from "@/schema";
import { CarcinogenicityLevelBadge, EvidenceLevelIndicator, EVIDENCE_LEVEL_CONFIG, CARCINOGENICITY_LEVEL_CONFIG } from "./HarmPotentialBadges";

interface ToxicitySubsectionProps {
  toxicity: NormalizedHarmPotential['toxicity'];
}

const DEFAULT_ORGAN_SYSTEM_ICON = "healthicons:organ-outline";

// Mapping of organ system names to their icons
const ORGAN_SYSTEM_ICONS: Record<string, string> = {
  // Primary terms
  "Urinary System": "healthicons:bladder-outline",
  "Hepatic": "healthicons:liver-alt-outline",
  "Central Nervous System": "healthicons:nerve",
  "Renal": "healthicons:kidneys-outline-24px",
  "Respiratory": "tabler:lungs",
  "Respiratory System": "tabler:lungs",
  "Cardiovascular": "icon-park-outline:heart",
  "Digestive": "covid:symptoms-nausea",
  "Hematological": "hugeicons:blood",
  "Dermatological": "material-symbols-light:dermatology-outline-rounded",
  "Endocrine": "tabler:adjustments",
  "Immunological": "tabler:virus",
  "Musculoskeletal": "healthicons:skeleton",
  // Synonyms mapped to existing icons
  "Urinary": "healthicons:bladder-outline",
  "Endocrine System": "tabler:adjustments",
  "Gastrointestinal": "covid:symptoms-nausea",
  "Immune System": "tabler:virus",
  "Pulmonary": "tabler:lungs",
  "Skeletal": "healthicons:skeleton",
  "Skin (Levamisole-Related)": "material-symbols-light:dermatology-outline-rounded",
  // Additional terms
  "Auditory": "lucide:ear",
  "Nasal": "hugeicons:nose",
  "Nasal Cavity": "hugeicons:nose",
  "Nasal/Upper Respiratory": "healthicons:ear-nose-throat-outline",
  "Oral/Dental": "tabler:dental",
  "Pulmonary/Vascular": "healthicons:blood-vessel-outline",
  "Reproductive": "healthicons:fetus-outline",
  "Thermoregulation": "streamline-ultimate:temperature-thermometer-medium-bold",
  "Thermoregulatory": "streamline-ultimate:temperature-thermometer-medium-bold",
  // Missing icons - need to be added
  // "Developmental": "",
  // "Vascular": "",
};

const NORMALIZED_ORGAN_SYSTEM_ICONS = Object.fromEntries(
  Object.entries(ORGAN_SYSTEM_ICONS).map(([system, icon]) => [system.trim().toLowerCase(), icon]),
);

export function getOrganSystemIcon(system?: string | null) {
  if (!system) return DEFAULT_ORGAN_SYSTEM_ICON;

  return ORGAN_SYSTEM_ICONS[system]
    || NORMALIZED_ORGAN_SYSTEM_ICONS[system.trim().toLowerCase()]
    || DEFAULT_ORGAN_SYSTEM_ICON;
}

function LethalDosageCard({ toxicity }: { toxicity: NormalizedHarmPotential['toxicity'] }) {
  const { lethal_dosage, ld50String } = toxicity;
  const { ld50, notes } = lethal_dosage;

  const hasNotes = notes.trim().length > 0;
  const hasLegacyString = ld50String.trim().length > 0 && !hasNotes;
  const hasLD50Table = ld50.length > 0;
  const hasContent = hasNotes || hasLegacyString || hasLD50Table;

  if (!hasContent) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 break-inside-avoid">
      <div className="flex items-center gap-2">
        <Icon icon="tabler:grave" size={18} className="text-fuchsia-300" />
        <h4 className="font-semibold text-white">Lethal Dosage</h4>
      </div>

      {/* Notes section (freeform text) - displayed above LD50 table */}
      {hasNotes && (
        <p className="text-sm text-white/80">{notes}</p>
      )}

      {/* Legacy string display (for backward compatibility) */}
      {hasLegacyString && (
        <p className="text-sm text-white/80">{ld50String}</p>
      )}

      {/* LD50 Table section */}
      {hasLD50Table && (
        <div className="flex flex-col gap-2">
          {/* Show subheading if we also have notes */}
          {hasNotes && (
            <h5 className="text-xs font-medium uppercase tracking-wider text-white/50">LD50 Data</h5>
          )}
          {ld50.length === 1 && !ld50[0].species ? (
            <p className="text-sm text-white/80">
              {ld50[0].unit || `${ld50[0].value} ${ld50[0].unit}`}
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/10 text-xs uppercase tracking-wider text-white/70">
                    <th className="px-4 py-2 text-left font-medium">Species</th>
                    <th className="px-4 py-2 text-left font-medium">Route</th>
                    <th className="px-4 py-2 text-right font-medium">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 bg-white/5">
                  {ld50.map((entry, idx) => (
                    <tr key={idx} className="transition hover:bg-white/10">
                      <td className="px-4 py-2 font-medium text-white/90">{entry.species || "—"}</td>
                      <td className="px-4 py-2 text-white/70">{entry.route || "—"}</td>
                      <td className="px-4 py-2 text-right font-mono text-white/90">
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
    </div>
  );
}

interface OrganToxicityEntry {
  system?: string;
  findings?: string;
  mechanism?: string;
  notes?: string;
}

function OrganToxicityCard({ entry }: { entry: OrganToxicityEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = !!entry.mechanism || !!entry.notes;
  const systemIcon = getOrganSystemIcon(entry.system);

  return (
    <div className="break-inside-avoid flex flex-col rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10">
      {entry.system && (
        <div className="mb-3 flex items-center gap-2 border-b border-white/5 pb-2">
          <Icon icon={systemIcon} size={24} className="text-fuchsia-300" />
          <div className="font-semibold text-fuchsia-100">{entry.system}</div>
        </div>
      )}

      {entry.findings && (
        <p className="text-sm leading-relaxed text-white/80">{entry.findings}</p>
      )}

      {hasDetails && (
        <>
          {expanded && (
            <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              {entry.mechanism && (
                <div className="text-sm">
                  <span className="block mb-1 font-semibold uppercase tracking-wider text-white/40 text-[10px]">Mechanism</span>
                  <p className="text-white/70 leading-relaxed">{entry.mechanism}</p>
                </div>
              )}
              {entry.notes && (
                <div className="text-sm">
                  <span className="block mb-1 font-semibold uppercase tracking-wider text-white/40 text-[10px]">Notes</span>
                  <p className="italic text-white/60 leading-relaxed">{entry.notes}</p>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex justify-start">
            <ExpandButton
              isExpanded={expanded}
              onToggle={() => setExpanded(!expanded)}
              className="bg-white/5 hover:bg-white/10"
            />
          </div>
        </>
      )}
    </div>
  );
}


function CarcinogenicityCard({ toxicity }: { toxicity: NormalizedHarmPotential['toxicity'] }) {
  const { carcinogenicity } = toxicity;
  const evidence = carcinogenicity.evidence && typeof carcinogenicity.evidence === 'object'
    ? carcinogenicity.evidence as {
        human_epidemiological?: 'none' | 'negative' | 'limited' | 'positive';
        animal_models?: { species?: string[]; level?: 'none' | 'negative' | 'limited' | 'positive' };
        in_vitro?: { type?: string; assay_type?: string };
        mechanistic?: { basis?: string; level?: 'none' | 'negative' | 'limited' | 'positive' };
      }
    : null;

  // Hide if level is unknown or no_evidence
  if (carcinogenicity.level === 'unknown' || carcinogenicity.level === 'no_evidence') return null;

  const hasCarcinogenicity =
    (carcinogenicity.description || "").trim().length > 0 || carcinogenicity.level != null;

  if (!hasCarcinogenicity) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 break-inside-avoid">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon="mingcute:cancer-line" size={18} className="text-fuchsia-300" />
          <h4 className="font-semibold text-white">Carcinogenicity</h4>
        </div>
        <CarcinogenicityLevelBadge level={carcinogenicity.level} />
      </div>

      {carcinogenicity.description && (
        <p className="text-sm text-white/80">{carcinogenicity.description}</p>
      )}

      {evidence && (
        <div className="mt-2 rounded-lg bg-black/20 p-3 text-sm">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/50">Evidence Basis</div>
          <div className="grid gap-y-2">
            <EvidenceLevelIndicator
              level={evidence.human_epidemiological}
              label="Human Epidemiological"
            />

            {evidence.animal_models && (
              <div className="flex items-center justify-between">
                <span className="text-white/60">Animal Models</span>
                <div className="text-right">
                  <span className={EVIDENCE_LEVEL_CONFIG[evidence.animal_models.level || "none"]?.color || "text-white/60"}>
                    {evidence.animal_models.level
                      ? EVIDENCE_LEVEL_CONFIG[evidence.animal_models.level]?.label || "None"
                      : "None"}
                  </span>
                  {evidence.animal_models.species?.length > 0 && (
                    <div className="text-xs text-white/40">
                      ({evidence.animal_models.species.join(", ")})
                    </div>
                  )}
                </div>
              </div>
            )}

            {evidence.in_vitro && (
              <div className="flex items-center justify-between">
                <span className="text-white/60">In Vitro</span>
                <div className="text-right text-white/80">
                  {evidence.in_vitro.type}
                  {evidence.in_vitro.assay_type && (
                    <div className="text-xs text-white/40">{evidence.in_vitro.assay_type}</div>
                  )}
                </div>
              </div>
            )}

            {evidence.mechanistic && (
              <div className="flex items-center justify-between">
                <span className="text-white/60">Mechanistic</span>
                <span className={EVIDENCE_LEVEL_CONFIG[evidence.mechanistic.level || "none"]?.color || "text-white/60"}>
                  {evidence.mechanistic.level
                    ? EVIDENCE_LEVEL_CONFIG[evidence.mechanistic.level]?.label || "None"
                    : "None"}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AntibioticFunctionCard({ toxicity }: { toxicity: NormalizedHarmPotential['toxicity'] }) {
  const { antibiotic_function } = toxicity;

  // Hide if level is unknown or no_evidence
  if (antibiotic_function.level === 'unknown' || antibiotic_function.level === 'no_evidence') return null;

  const hasAntibioticFunction =
    (antibiotic_function.description || "").trim().length > 0 || antibiotic_function.level != null;

  if (!hasAntibioticFunction) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 break-inside-avoid">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon="streamline:bacteria-virus-cells-biology" size={18} className="text-fuchsia-300" />
          <h4 className="font-semibold text-white">Antibiotic Function</h4>
        </div>
        {antibiotic_function.level && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CARCINOGENICITY_LEVEL_CONFIG[antibiotic_function.level as CarcinogenicityLevel]?.color || "text-white/60"
              } ${CARCINOGENICITY_LEVEL_CONFIG[antibiotic_function.level as CarcinogenicityLevel]?.bgColor || "bg-white/10"}`}
          >
            {CARCINOGENICITY_LEVEL_CONFIG[antibiotic_function.level as CarcinogenicityLevel]?.label || antibiotic_function.level}
          </span>
        )}
      </div>
      {antibiotic_function.description && (
        <p className="text-sm text-white/80">{antibiotic_function.description}</p>
      )}
    </div>
  );
}

export function ToxicitySubsection({ toxicity }: ToxicitySubsectionProps) {
  const { lethal_dosage, ld50, ld50String, organ_toxicity, organToxicityString, carcinogenicity, antibiotic_function } = toxicity;

  // Check if carcinogenicity/antibiotic cards would actually render (not unknown/no_evidence)
  const hasCarcinogenicity =
    carcinogenicity.level !== 'unknown' && carcinogenicity.level !== 'no_evidence' &&
    ((carcinogenicity.description || "").trim().length > 0 || carcinogenicity.level != null);
  const hasAntibioticFunction =
    antibiotic_function.level !== 'unknown' && antibiotic_function.level !== 'no_evidence' &&
    ((antibiotic_function.description || "").trim().length > 0 || antibiotic_function.level != null);

  // Check for lethal dosage content (new format notes OR legacy ld50 data)
  const hasLD50 = lethal_dosage.ld50.length > 0 || lethal_dosage.notes.trim().length > 0 || ld50.length > 0 || ld50String.trim().length > 0;
  const hasOrganToxicity = organ_toxicity.length > 0 || organToxicityString.trim().length > 0;

  // Check if we have any masonry grid content
  const hasMasonryContent = hasOrganToxicity || hasCarcinogenicity || hasAntibioticFunction;

  const hasContent = hasLD50 || hasMasonryContent;

  if (!hasContent) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Icon icon="healthicons:poison-24px" size={20} className="text-rose-300" />
          <h3 className="font-semibold text-white">Toxicity</h3>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <div className="flex flex-col gap-4">
        {/* Lethal Dosage card at full width */}
        {hasLD50 && <LethalDosageCard toxicity={toxicity} />}

        {/* Combined masonry grid with organ toxicity, carcinogenicity, and antibiotic function */}
        {hasMasonryContent && (
          <div className="columns-1 gap-4 space-y-4 md:columns-2">
            {organ_toxicity.map((entry, idx) => (
              <OrganToxicityCard key={idx} entry={entry} />
            ))}
            {organToxicityString && (
              <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 break-inside-avoid">
                <p className="text-sm text-white/80">{organToxicityString}</p>
              </div>
            )}
            <CarcinogenicityCard toxicity={toxicity} />
            <AntibioticFunctionCard toxicity={toxicity} />
          </div>
        )}
      </div>
    </div>
  );
}
