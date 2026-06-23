import { useState } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { StatusBadge, type StatusBadgeTone } from "@/components/common/StatusBadge";
import { NormalizedHarmPotential } from "./HarmPotentialUtils";
import type { CarcinogenicityLevel } from "@/schema";
import type { SubstanceArticle } from "@/schema";
import { CitedText } from "../../CitedText";
import { CarcinogenicityLevelBadge, EvidenceLevelIndicator, EVIDENCE_LEVEL_CONFIG, CARCINOGENICITY_LEVEL_CONFIG } from "./HarmPotentialBadges";
import { ArticleSection, ArticleSectionGroup } from "@/components/common/ArticleSection";

interface ToxicitySubsectionProps {
  toxicity: NormalizedHarmPotential['toxicity'];
  article: SubstanceArticle;
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

function LethalDosageCard({ toxicity, article }: { toxicity: NormalizedHarmPotential['toxicity']; article: SubstanceArticle }) {
  const { lethal_dosage, ld50String } = toxicity;
  const { ld50, notes } = lethal_dosage;

  const hasNotes = notes.trim().length > 0;
  const hasLegacyString = ld50String.trim().length > 0 && !hasNotes;
  const hasLD50Table = ld50.length > 0;
  const hasContent = hasNotes || hasLegacyString || hasLD50Table;

  if (!hasContent) return null;

  return (
    <ArticleSection.InfoCard
      title="Lethal Dosage"
      icon="tabler:grave"
      padding="sm"
      variant="interactive"
      className="break-inside-avoid"
      contentClassName="space-y-3"
    >
      {/* Notes section (freeform text) - displayed above LD50 table */}
      {hasNotes && (
        <p><CitedText text={notes} article={article} /></p>
      )}

      {/* Legacy string display (for backward compatibility) */}
      {hasLegacyString && (
        <p><CitedText text={ld50String} article={article} /></p>
      )}

      {/* LD50 Table section */}
      {hasLD50Table && (
        <div className="flex flex-col gap-2">
          {/* Show subheading if we also have notes */}
          {hasNotes && (
            <h5 className="text-xs font-medium uppercase tracking-wider theme-text-muted">LD50 Data</h5>
          )}
          {ld50.length === 1 && !ld50[0].species ? (
            <p>
              {ld50[0].unit || `${ld50[0].value} ${ld50[0].unit}`}
            </p>
          ) : (
            <div className="theme-ld50-table-panel overflow-hidden rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="theme-ld50-table-head text-xs uppercase tracking-wider theme-text-muted">
                    <th className="px-4 py-2 text-left font-medium">Species</th>
                    <th className="px-4 py-2 text-left font-medium">Route</th>
                    <th className="px-4 py-2 text-right font-medium">Value</th>
                  </tr>
                </thead>
                <tbody className="theme-ld50-table-body">
                  {ld50.map((entry, idx) => (
                    <tr key={idx} className="theme-ld50-table-row transition">
                      <td className="px-4 py-2 font-medium theme-text-primary">{entry.species || "—"}</td>
                      <td className="px-4 py-2 theme-text-muted">{entry.route || "—"}</td>
                      <td className="px-4 py-2 text-right font-mono theme-text-primary">
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
    </ArticleSection.InfoCard>
  );
}

interface OrganToxicityEntry {
  system?: string;
  findings?: string;
  mechanism?: string;
  notes?: string;
}

function OrganToxicityCard({ entry, article }: { entry: OrganToxicityEntry; article: SubstanceArticle }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = !!entry.mechanism || !!entry.notes;
  const systemIcon = getOrganSystemIcon(entry.system);

  return (
    <ArticleSection.InfoCard
      title={entry.system}
      icon={systemIcon}
      padding="sm"
      variant="interactive"
      className="break-inside-avoid"
      contentClassName="space-y-3"
    >
      {entry.findings && (
        <p><CitedText text={entry.findings} article={article} /></p>
      )}

      {hasDetails && (
        <>
          {expanded && (
            <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="theme-horizontal-divider" />
              {entry.mechanism && (
                <div className="text-sm">
                  <span className="block mb-1 font-semibold uppercase tracking-wider theme-text-subtle text-[10px]">Mechanism</span>
                  <p className="theme-text-muted leading-relaxed"><CitedText text={entry.mechanism} article={article} /></p>
                </div>
              )}
              {entry.notes && (
                <div className="text-sm">
                  <span className="block mb-1 font-semibold uppercase tracking-wider theme-text-subtle text-[10px]">Notes</span>
                  <p className="italic theme-text-muted leading-relaxed"><CitedText text={entry.notes} article={article} /></p>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex justify-start">
            <ExpandButton
              isExpanded={expanded}
              onToggle={() => setExpanded(!expanded)}
              variant="card"
            />
          </div>
        </>
      )}
    </ArticleSection.InfoCard>
  );
}


function CarcinogenicityCard({ toxicity, article }: { toxicity: NormalizedHarmPotential['toxicity']; article: SubstanceArticle }) {
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
    <ArticleSection.InfoCard
      title="Carcinogenicity"
      icon="mingcute:cancer-line"
      accessory={<CarcinogenicityLevelBadge level={carcinogenicity.level} />}
      padding="sm"
      variant="interactive"
      className="break-inside-avoid"
      contentClassName="space-y-3"
    >
      {carcinogenicity.description && (
        <p><CitedText text={carcinogenicity.description} article={article} /></p>
      )}

      {evidence && (
        <div className="rounded-lg bg-[color:color-mix(in_srgb,var(--theme-surface-strong)_42%,var(--theme-panel-base))] p-3 text-sm">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider theme-text-muted">Evidence Basis</div>
          <div className="grid gap-y-2">
            <EvidenceLevelIndicator
              level={evidence.human_epidemiological}
              label="Human Epidemiological"
            />

            {evidence.animal_models && (
              <div className="flex items-center justify-between">
                <span className="theme-text-muted">Animal Models</span>
                <div className="text-right">
                  <span className={EVIDENCE_LEVEL_CONFIG[evidence.animal_models.level || "none"]?.color || "theme-text-muted"}>
                    {evidence.animal_models.level
                      ? EVIDENCE_LEVEL_CONFIG[evidence.animal_models.level]?.label || "None"
                      : "None"}
                  </span>
                  {evidence.animal_models.species?.length > 0 && (
                    <div className="text-xs theme-text-subtle">
                      ({evidence.animal_models.species.join(", ")})
                    </div>
                  )}
                </div>
              </div>
            )}

            {evidence.in_vitro && (
              <div className="flex items-center justify-between">
                <span className="theme-text-muted">In Vitro</span>
                <div className="text-right theme-text-primary">
                  {evidence.in_vitro.type}
                  {evidence.in_vitro.assay_type && (
                    <div className="text-xs theme-text-subtle">{evidence.in_vitro.assay_type}</div>
                  )}
                </div>
              </div>
            )}

            {evidence.mechanistic && (
              <div className="flex items-center justify-between">
                <span className="theme-text-muted">Mechanistic</span>
                <span className={EVIDENCE_LEVEL_CONFIG[evidence.mechanistic.level || "none"]?.color || "theme-text-muted"}>
                  {evidence.mechanistic.level
                    ? EVIDENCE_LEVEL_CONFIG[evidence.mechanistic.level]?.label || "None"
                    : "None"}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </ArticleSection.InfoCard>
  );
}

function AntibioticFunctionCard({ toxicity, article }: { toxicity: NormalizedHarmPotential['toxicity']; article: SubstanceArticle }) {
  const { antibiotic_function } = toxicity;

  // Hide if level is unknown or no_evidence
  if (antibiotic_function.level === 'unknown' || antibiotic_function.level === 'no_evidence') return null;

  const hasAntibioticFunction =
    (antibiotic_function.description || "").trim().length > 0 || antibiotic_function.level != null;

  if (!hasAntibioticFunction) return null;

  return (
    <ArticleSection.InfoCard
      title="Antibiotic Function"
      icon="streamline:bacteria-virus-cells-biology"
      accessory={
        antibiotic_function.level ? (
          <StatusBadge
            tone={(CARCINOGENICITY_LEVEL_CONFIG[antibiotic_function.level as CarcinogenicityLevel]?.tone as StatusBadgeTone) || "white"}
            className={CARCINOGENICITY_LEVEL_CONFIG[antibiotic_function.level as CarcinogenicityLevel]?.badgeClass || "theme-badge-surface"}
          >
            {CARCINOGENICITY_LEVEL_CONFIG[antibiotic_function.level as CarcinogenicityLevel]?.label || antibiotic_function.level}
          </StatusBadge>
        ) : null
      }
      padding="sm"
      variant="interactive"
      className="break-inside-avoid"
    >
      {antibiotic_function.description && (
        <p><CitedText text={antibiotic_function.description} article={article} /></p>
      )}
    </ArticleSection.InfoCard>
  );
}

export function ToxicitySubsection({ toxicity, article }: ToxicitySubsectionProps) {
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
    <ArticleSectionGroup
      heading="Toxicity"
      icon="healthicons:poison-24px"
      spacing="loose"
      className="theme-section-group-divider"
      headingClassName="text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8"
      iconClassName="scale-110"
    >
      <div className="flex flex-col gap-4">
        {/* Lethal Dosage card at full width */}
        {hasLD50 && <LethalDosageCard toxicity={toxicity} article={article} />}

        {/* Combined masonry grid with organ toxicity, carcinogenicity, and antibiotic function */}
        {hasMasonryContent && (
          <div className="columns-1 gap-4 space-y-4 md:columns-2">
            {organ_toxicity.map((entry, idx) => (
              <OrganToxicityCard key={idx} entry={entry} article={article} />
            ))}
            {organToxicityString && (
              <ArticleSection.InfoCard
                title="Organ Toxicity"
                icon={DEFAULT_ORGAN_SYSTEM_ICON}
                padding="sm"
                variant="interactive"
                className="break-inside-avoid"
              >
                <p><CitedText text={organToxicityString} article={article} /></p>
              </ArticleSection.InfoCard>
            )}
            <CarcinogenicityCard toxicity={toxicity} article={article} />
            <AntibioticFunctionCard toxicity={toxicity} article={article} />
          </div>
        )}
      </div>
    </ArticleSectionGroup>
  );
}
