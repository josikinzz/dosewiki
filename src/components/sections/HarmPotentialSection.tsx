import { memo } from "react";
import { Icon } from "../common/Icon";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import { Bullet } from "../common/Bullet";
import type { SubstanceArticle } from "../../schema";

interface HarmPotentialSectionProps {
  article: SubstanceArticle;
}

export const HarmPotentialSection = memo(function HarmPotentialSection({
  article,
}: HarmPotentialSectionProps) {
  const { harm_potential } = article;

  const hasAddiction = harm_potential.addiction_liability.trim().length > 0;
  const hasDependence = harm_potential.dependence_liability.trim().length > 0;
  const hasToxicity =
    harm_potential.toxicity.ld50.trim().length > 0 ||
    harm_potential.toxicity.organ_toxicity.trim().length > 0 ||
    harm_potential.toxicity.carcinogenicity.trim().length > 0 ||
    harm_potential.toxicity.other.trim().length > 0;
  const hasRisks =
    harm_potential.risks.psychosis.trim().length > 0 ||
    harm_potential.risks.self_harm.trim().length > 0 ||
    harm_potential.risks.seizure.trim().length > 0 ||
    harm_potential.risks.other.length > 0;

  if (!hasAddiction && !hasDependence && !hasToxicity && !hasRisks) {
    return null;
  }

  return (
    <SectionCard delay={0}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon="lucide:ambulance" label="Harm Potential" />
        Harm Potential
      </h2>

      {/* Addiction & Toxicity in single column */}
      {(hasAddiction || hasDependence || hasToxicity) && (
        <div className="flex flex-col gap-4">
          {/* Addiction & Dependence */}
          {(hasAddiction || hasDependence) && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
                <Icon icon="jam:repeat" size={20} className="text-rose-300" />
                Addiction & Dependence
              </h3>
              <div className="flex flex-col gap-3">
                {hasAddiction && (
                  <div className="rounded-lg bg-white/5 p-3">
                    <span className="text-sm font-semibold text-white">Addiction Liability</span>
                    <p className="mt-1 text-sm text-white/80">{harm_potential.addiction_liability}</p>
                  </div>
                )}
                {hasDependence && (
                  <div className="rounded-lg bg-white/5 p-3">
                    <span className="text-sm font-semibold text-white">Dependence Liability</span>
                    <p className="mt-1 text-sm text-white/80">{harm_potential.dependence_liability}</p>
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
                {harm_potential.toxicity.ld50 && (
                  <div className="rounded-lg bg-white/5 p-3">
                    <span className="text-sm font-semibold text-white">LD50</span>
                    <p className="mt-1 text-sm text-white/80">{harm_potential.toxicity.ld50}</p>
                  </div>
                )}
                {harm_potential.toxicity.organ_toxicity && (
                  <div className="rounded-lg bg-white/5 p-3">
                    <span className="text-sm font-semibold text-white">Organ Toxicity</span>
                    <p className="mt-1 text-sm text-white/80">{harm_potential.toxicity.organ_toxicity}</p>
                  </div>
                )}
                {harm_potential.toxicity.carcinogenicity && (
                  <div className="rounded-lg bg-white/5 p-3">
                    <span className="text-sm font-semibold text-white">Carcinogenicity</span>
                    <p className="mt-1 text-sm text-white/80">{harm_potential.toxicity.carcinogenicity}</p>
                  </div>
                )}
                {harm_potential.toxicity.other && (
                  <div className="rounded-lg bg-white/5 p-3">
                    <span className="text-sm font-semibold text-white">Other</span>
                    <p className="mt-1 text-sm text-white/80">{harm_potential.toxicity.other}</p>
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
            {harm_potential.risks.psychosis && (
              <div className="rounded-lg bg-white/5 p-3">
                <span className="text-sm font-semibold text-white">Psychosis</span>
                <p className="mt-1 text-sm text-white/80">{harm_potential.risks.psychosis}</p>
              </div>
            )}
            {harm_potential.risks.self_harm && (
              <div className="rounded-lg bg-white/5 p-3">
                <span className="text-sm font-semibold text-white">Self-harm</span>
                <p className="mt-1 text-sm text-white/80">{harm_potential.risks.self_harm}</p>
              </div>
            )}
            {harm_potential.risks.seizure && (
              <div className="rounded-lg bg-white/5 p-3">
                <span className="text-sm font-semibold text-white">Seizure</span>
                <p className="mt-1 text-sm text-white/80">{harm_potential.risks.seizure}</p>
              </div>
            )}
            {harm_potential.risks.other.length > 0 && (
              <div className="rounded-lg bg-white/5 p-3">
                <span className="text-sm font-semibold text-white">Other Risks</span>
                <ul className="mt-1 space-y-1">
                  {harm_potential.risks.other.map((risk, idx) => (
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
