import { memo } from "react";
import Masonry from "react-masonry-css";
import { AlertOctagon, Heart, Skull, Syringe, Zap } from "lucide-react";
import { SectionCard } from "../../../../common/SectionCard";
import { IconBadge } from "../../../../common/IconBadge";
import type { GeneratedArticle } from "../../../../../types/generatorSchema";

const MASONRY_BREAKPOINTS = {
  default: 2,
  768: 1,
};

interface PreviewHarmPotentialSectionProps {
  article: GeneratedArticle;
}

export const PreviewHarmPotentialSection = memo(function PreviewHarmPotentialSection({
  article,
}: PreviewHarmPotentialSectionProps) {
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
        <IconBadge icon={AlertOctagon} label="Harm Potential" />
        Harm Potential
      </h2>

      {/* Addiction & Toxicity in masonry */}
      {(hasAddiction || hasDependence || hasToxicity) && (
        <Masonry
          breakpointCols={MASONRY_BREAKPOINTS}
          className="flex w-full gap-4"
          columnClassName="flex flex-col gap-4"
        >
          {/* Addiction & Dependence */}
          {(hasAddiction || hasDependence) && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                <Syringe className="h-4 w-4 text-rose-300" />
                Addiction & Dependence
              </h3>
              {hasAddiction && (
                <div className="mb-2">
                  <span className="text-xs font-medium text-white/60">Addiction Liability:</span>
                  <p className="mt-1 text-sm text-white/80">{harm_potential.addiction_liability}</p>
                </div>
              )}
              {hasDependence && (
                <div>
                  <span className="text-xs font-medium text-white/60">Dependence Liability:</span>
                  <p className="mt-1 text-sm text-white/80">{harm_potential.dependence_liability}</p>
                </div>
              )}
            </div>
          )}

          {/* Toxicity */}
          {hasToxicity && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                <Skull className="h-4 w-4 text-rose-300" />
                Toxicity
              </h3>
              {harm_potential.toxicity.ld50 && (
                <div className="mb-2">
                  <span className="text-xs font-medium text-white/60">LD50:</span>
                  <p className="mt-1 text-sm text-white/80">{harm_potential.toxicity.ld50}</p>
                </div>
              )}
              {harm_potential.toxicity.organ_toxicity && (
                <div className="mb-2">
                  <span className="text-xs font-medium text-white/60">Organ Toxicity:</span>
                  <p className="mt-1 text-sm text-white/80">{harm_potential.toxicity.organ_toxicity}</p>
                </div>
              )}
              {harm_potential.toxicity.carcinogenicity && (
                <div className="mb-2">
                  <span className="text-xs font-medium text-white/60">Carcinogenicity:</span>
                  <p className="mt-1 text-sm text-white/80">{harm_potential.toxicity.carcinogenicity}</p>
                </div>
              )}
              {harm_potential.toxicity.other && (
                <div>
                  <span className="text-xs font-medium text-white/60">Other:</span>
                  <p className="mt-1 text-sm text-white/80">{harm_potential.toxicity.other}</p>
                </div>
              )}
            </div>
          )}
        </Masonry>
      )}

      {/* Risks - full width below masonry */}
      {hasRisks && (
        <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Zap className="h-4 w-4 text-rose-300" />
            Risks
          </h3>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {harm_potential.risks.psychosis && (
              <div className="rounded-lg bg-white/5 p-3">
                <span className="text-xs font-medium text-rose-300">Psychosis</span>
                <p className="mt-1 text-sm text-white/80">{harm_potential.risks.psychosis}</p>
              </div>
            )}
            {harm_potential.risks.self_harm && (
              <div className="rounded-lg bg-white/5 p-3">
                <span className="text-xs font-medium text-rose-300">Self-harm</span>
                <p className="mt-1 text-sm text-white/80">{harm_potential.risks.self_harm}</p>
              </div>
            )}
            {harm_potential.risks.seizure && (
              <div className="rounded-lg bg-white/5 p-3">
                <span className="text-xs font-medium text-rose-300">Seizure</span>
                <p className="mt-1 text-sm text-white/80">{harm_potential.risks.seizure}</p>
              </div>
            )}
            {harm_potential.risks.other.length > 0 && (
              <div className="rounded-lg bg-white/5 p-3 sm:col-span-2 lg:col-span-3">
                <span className="text-xs font-medium text-rose-300">Other Risks</span>
                <ul className="mt-1 space-y-1">
                  {harm_potential.risks.other.map((risk, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm text-white/80">
                      <span className="h-1 w-1 rounded-full bg-rose-400" />
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
