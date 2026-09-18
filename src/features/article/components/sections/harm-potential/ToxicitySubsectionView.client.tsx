"use client";

import { useState, type ReactNode } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import {
  ArticleSection,
  ArticleSectionGroup,
} from "@/components/common/ArticleSection";
import {
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/common/StatusBadge";
import type { CarcinogenicityLevel } from "@/schema";
import { msg, useT, type Translate } from "@/i18n/client";
import {
  CarcinogenicityLevelBadge,
  EvidenceLevelIndicator,
} from "./HarmPotentialBadges";
import {
  CARCINOGENICITY_LEVEL_CONFIG,
  EVIDENCE_LEVEL_CONFIG,
} from "./harmPotentialLabels";
import { useMasonryRowSpans } from "./useMasonryRowSpans";

const MASONRY_ITEM_CLASS_NAME = "mb-4";
const DEFAULT_ORGAN_SYSTEM_ICON = "healthicons:body-outline";
const ORGAN_SYSTEM_ICONS: Record<string, string> = {
  [msg("Urinary System")]: "healthicons:bladder-outline",
  [msg("Urinary")]: "healthicons:bladder-outline",
  [msg("Hepatic")]: "healthicons:liver-alt-outline",
  [msg("Central Nervous System")]: "healthicons:nerve",
  [msg("Renal")]: "healthicons:kidneys-outline-24px",
  [msg("Respiratory")]: "tabler:lungs",
  [msg("Respiratory System")]: "tabler:lungs",
  [msg("Pulmonary")]: "tabler:lungs",
  [msg("Cardiovascular")]: "icon-park-outline:heart",
  [msg("Digestive")]: "covid:symptoms-nausea",
  [msg("Gastrointestinal")]: "covid:symptoms-nausea",
  [msg("Hematological")]: "hugeicons:blood",
  [msg("Dermatological")]: "material-symbols-light:dermatology-outline-rounded",
  [msg("Skin (Levamisole-Related)")]:
    "material-symbols-light:dermatology-outline-rounded",
  [msg("Endocrine")]: "tabler:adjustments",
  [msg("Endocrine System")]: "tabler:adjustments",
  [msg("Immunological")]: "tabler:virus",
  [msg("Immune System")]: "tabler:virus",
  [msg("Musculoskeletal")]: "healthicons:skeleton",
  [msg("Skeletal")]: "healthicons:skeleton",
  [msg("Auditory")]: "lucide:ear",
  [msg("Nasal")]: "hugeicons:nose",
  [msg("Nasal Cavity")]: "hugeicons:nose",
  [msg("Nasal/Upper Respiratory")]: "healthicons:ear-nose-throat-outline",
  [msg("Oral/Dental")]: "tabler:dental",
  [msg("Pulmonary/Vascular")]: "healthicons:blood-vessel-outline",
  [msg("Reproductive")]: "healthicons:fetus-outline",
  [msg("Thermoregulation")]:
    "streamline-ultimate:temperature-thermometer-medium-bold",
  [msg("Thermoregulatory")]:
    "streamline-ultimate:temperature-thermometer-medium-bold",
};
const NORMALIZED_ICONS = Object.fromEntries(
  Object.entries(ORGAN_SYSTEM_ICONS).map(([key, icon]) => [
    key.trim().toLowerCase(),
    icon,
  ]),
);
function getOrganSystemIcon(system: string | undefined, t: Translate) {
  if (!system) return DEFAULT_ORGAN_SYSTEM_ICON;
  const normalized = system.trim().toLowerCase();
  const direct = ORGAN_SYSTEM_ICONS[system] || NORMALIZED_ICONS[normalized];
  if (direct) return direct;
  for (const [label, icon] of Object.entries(ORGAN_SYSTEM_ICONS))
    if (t(label).trim().toLowerCase() === normalized) return icon;
  return DEFAULT_ORGAN_SYSTEM_ICON;
}

type Ld50Entry = {
  species?: string;
  route?: string;
  value?: number | null;
  unit?: string;
};
type Evidence = {
  human_epidemiological?: "none" | "negative" | "limited" | "positive";
  animal_models?: {
    species?: string[];
    level?: "none" | "negative" | "limited" | "positive";
  };
  in_vitro?: { type?: string; assay_type?: string };
  mechanistic?: {
    basis?: string;
    level?: "none" | "negative" | "limited" | "positive";
  };
};
export interface ToxicityViewModel {
  lethal: { ld50: Ld50Entry[]; hasNotes: boolean; hasLegacy: boolean };
  organs: Array<{
    system?: string;
    hasFindings: boolean;
    hasMechanism: boolean;
    hasNotes: boolean;
  }>;
  hasLegacyOrgan: boolean;
  carcinogenicity: {
    level: CarcinogenicityLevel | null;
    evidence: Evidence | null;
    hasDescription: boolean;
  };
  antibiotic: { level: CarcinogenicityLevel | null; hasDescription: boolean };
}
export interface ToxicityContentSlots {
  lethalNotes?: ReactNode;
  legacyLd50?: ReactNode;
  organs: Array<{
    findings?: ReactNode;
    mechanism?: ReactNode;
    notes?: ReactNode;
  }>;
  legacyOrgan?: ReactNode;
  carcinogenicity?: ReactNode;
  antibiotic?: ReactNode;
}

function LethalCard({
  model,
  slots,
}: {
  model: ToxicityViewModel["lethal"];
  slots: ToxicityContentSlots;
}) {
  const t = useT();
  return (
    <ArticleSection.InfoCard
      title={t("Lethal Dosage")}
      icon="tabler:grave"
      padding="sm"
      variant="nested"
      className="break-inside-avoid"
      contentClassName="space-y-3"
    >
      {model.hasNotes && <p>{slots.lethalNotes}</p>}
      {model.hasLegacy && <p>{slots.legacyLd50}</p>}
      {model.ld50.length > 0 && (
        <div className="flex flex-col gap-2">
          {model.hasNotes && (
            <h5 className="text-xs font-medium uppercase tracking-wider theme-text-muted">
              {t("LD50 Data")}
            </h5>
          )}
          {model.ld50.length === 1 && !model.ld50[0].species ? (
            <p>
              {model.ld50[0].unit ||
                `${model.ld50[0].value} ${model.ld50[0].unit}`}
            </p>
          ) : (
            <div className="theme-ld50-table-panel overflow-hidden rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="theme-ld50-table-head text-xs uppercase tracking-wider theme-text-muted">
                    <th className="px-4 py-2 text-left font-medium">
                      {t("Species")}
                    </th>
                    <th className="px-4 py-2 text-left font-medium">
                      {t("Route")}
                    </th>
                    <th className="px-4 py-2 text-right font-medium">
                      {t("Value")}
                    </th>
                  </tr>
                </thead>
                <tbody className="theme-ld50-table-body">
                  {model.ld50.map((entry, index) => (
                    <tr key={index} className="theme-ld50-table-row transition">
                      <td className="px-4 py-2 font-medium theme-text-primary">
                        {entry.species || "—"}
                      </td>
                      <td className="px-4 py-2 theme-text-muted">
                        {entry.route || "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono theme-text-primary">
                        {entry.value != null
                          ? `${entry.value} ${entry.unit}`
                          : entry.unit || "—"}
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
function OrganCard({
  model,
  slot,
}: {
  model: ToxicityViewModel["organs"][number];
  slot: ToxicityContentSlots["organs"][number];
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const hasDetails = model.hasMechanism || model.hasNotes;
  return (
    <ArticleSection.InfoCard
      title={model.system ? t(model.system) : model.system}
      icon={getOrganSystemIcon(model.system, t)}
      padding="sm"
      variant="nested"
      className={MASONRY_ITEM_CLASS_NAME}
      contentClassName="space-y-3"
    >
      {model.hasFindings && <p>{slot.findings}</p>}
      {hasDetails && (
        <>
          {expanded && (
            <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="theme-horizontal-divider" />
              {model.hasMechanism && (
                <div className="text-sm">
                  <span className="block mb-1 font-semibold uppercase tracking-wider theme-text-subtle text-[10px]">
                    {t("Mechanism")}
                  </span>
                  <p className="theme-text-muted leading-relaxed">
                    {slot.mechanism}
                  </p>
                </div>
              )}
              {model.hasNotes && (
                <div className="text-sm">
                  <span className="block mb-1 font-semibold uppercase tracking-wider theme-text-subtle text-[10px]">
                    {t("Notes")}
                  </span>
                  <p className="italic theme-text-muted leading-relaxed">
                    {slot.notes}
                  </p>
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
function EvidencePanel({ evidence }: { evidence: Evidence }) {
  const t = useT();
  return (
    <div className="rounded-lg bg-[color:color-mix(in_srgb,var(--theme-surface-strong)_42%,var(--theme-panel-base))] p-3 text-sm">
      <div className="mb-2 text-xs font-bold uppercase tracking-wider theme-text-muted">
        {t("Evidence Basis")}
      </div>
      <div className="grid gap-y-2">
        <EvidenceLevelIndicator
          level={evidence.human_epidemiological}
          label={t("Human Epidemiological")}
        />
        {evidence.animal_models && (
          <div className="flex items-center justify-between">
            <span className="theme-text-muted">{t("Animal Models")}</span>
            <div className="text-right">
              <span
                className={
                  EVIDENCE_LEVEL_CONFIG[evidence.animal_models.level || "none"]
                    ?.color || "theme-text-muted"
                }
              >
                {t(
                  EVIDENCE_LEVEL_CONFIG[evidence.animal_models.level || "none"]
                    ?.label || "None",
                )}
              </span>
              {evidence.animal_models.species?.length ? (
                <div className="text-xs theme-text-subtle">
                  ({evidence.animal_models.species.join(", ")})
                </div>
              ) : null}
            </div>
          </div>
        )}
        {evidence.in_vitro && (
          <div className="flex items-center justify-between">
            <span className="theme-text-muted">{t("In Vitro")}</span>
            <div className="text-right theme-text-primary">
              {evidence.in_vitro.type}
              {evidence.in_vitro.assay_type && (
                <div className="text-xs theme-text-subtle">
                  {evidence.in_vitro.assay_type}
                </div>
              )}
            </div>
          </div>
        )}
        {evidence.mechanistic && (
          <div className="flex items-center justify-between">
            <span className="theme-text-muted">{t("Mechanistic")}</span>
            <span
              className={
                EVIDENCE_LEVEL_CONFIG[evidence.mechanistic.level || "none"]
                  ?.color || "theme-text-muted"
              }
            >
              {t(
                EVIDENCE_LEVEL_CONFIG[evidence.mechanistic.level || "none"]
                  ?.label || "None",
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ToxicitySubsectionView({
  model,
  slots,
}: {
  model: ToxicityViewModel;
  slots: ToxicityContentSlots;
}) {
  const t = useT();
  const hasCarcinogenicity =
    model.carcinogenicity.level !== "unknown" &&
    model.carcinogenicity.level !== "no_evidence" &&
    (model.carcinogenicity.hasDescription ||
      model.carcinogenicity.level != null);
  const hasAntibiotic =
    model.antibiotic.level !== "unknown" &&
    model.antibiotic.level !== "no_evidence" &&
    (model.antibiotic.hasDescription || model.antibiotic.level != null);
  const hasLethal =
    model.lethal.hasNotes ||
    model.lethal.hasLegacy ||
    model.lethal.ld50.length > 0;
  const count =
    model.organs.length +
    (model.hasLegacyOrgan ? 1 : 0) +
    (hasCarcinogenicity ? 1 : 0) +
    (hasAntibiotic ? 1 : 0);
  const masonryRef = useMasonryRowSpans<HTMLDivElement>(count);
  if (!hasLethal && count === 0) return null;
  return (
    <ArticleSectionGroup
      heading={t("Toxicity")}
      icon="healthicons:poison-24px"
      spacing="loose"
      className="theme-section-group-divider"
      headingClassName="text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8"
      iconClassName="scale-110"
    >
      <div className="flex flex-col gap-4">
        {hasLethal && <LethalCard model={model.lethal} slots={slots} />}
        {count > 0 && (
          <div
            ref={masonryRef}
            className="-mb-4 grid grid-cols-1 items-start gap-x-4 md:grid-cols-2"
          >
            {model.organs.map((organ, index) => (
              <OrganCard key={index} model={organ} slot={slots.organs[index]} />
            ))}
            {model.hasLegacyOrgan && (
              <ArticleSection.InfoCard
                title={t("Organ Toxicity")}
                icon={DEFAULT_ORGAN_SYSTEM_ICON}
                padding="sm"
                variant="nested"
                className={MASONRY_ITEM_CLASS_NAME}
              >
                <p>{slots.legacyOrgan}</p>
              </ArticleSection.InfoCard>
            )}
            {hasCarcinogenicity && (
              <ArticleSection.InfoCard
                title={t("Carcinogenicity")}
                icon="mingcute:cancer-line"
                accessory={
                  <CarcinogenicityLevelBadge
                    level={model.carcinogenicity.level}
                  />
                }
                padding="sm"
                variant="nested"
                className={MASONRY_ITEM_CLASS_NAME}
                contentClassName="space-y-3"
              >
                {model.carcinogenicity.hasDescription && (
                  <p>{slots.carcinogenicity}</p>
                )}
                {model.carcinogenicity.evidence && (
                  <EvidencePanel evidence={model.carcinogenicity.evidence} />
                )}
              </ArticleSection.InfoCard>
            )}
            {hasAntibiotic && (
              <ArticleSection.InfoCard
                title={t("Antibiotic Function")}
                icon="streamline:bacteria-virus-cells-biology"
                accessory={
                  model.antibiotic.level ? (
                    <StatusBadge
                      tone={
                        (CARCINOGENICITY_LEVEL_CONFIG[model.antibiotic.level]
                          ?.tone as StatusBadgeTone) || "white"
                      }
                      className={
                        CARCINOGENICITY_LEVEL_CONFIG[model.antibiotic.level]
                          ?.badgeClass || "theme-badge-surface"
                      }
                    >
                      {t(
                        CARCINOGENICITY_LEVEL_CONFIG[model.antibiotic.level]
                          ?.label || model.antibiotic.level,
                      )}
                    </StatusBadge>
                  ) : null
                }
                padding="sm"
                variant="nested"
                className={MASONRY_ITEM_CLASS_NAME}
              >
                {model.antibiotic.hasDescription && <p>{slots.antibiotic}</p>}
              </ArticleSection.InfoCard>
            )}
          </div>
        )}
      </div>
    </ArticleSectionGroup>
  );
}
