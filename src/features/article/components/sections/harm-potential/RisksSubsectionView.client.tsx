"use client";

import type { ReactNode } from "react";
import { ArticleSubsectionHeader } from "@/components/common/ArticleSection";
import { useT } from "@/i18n/client";
import type { NormalizedHarmPotential } from "./HarmPotentialUtils";
import { RiskLevelBadge } from "./HarmPotentialBadges";

type Risk = {
  level: NormalizedHarmPotential["risks"]["psychosis"]["level"];
  content: ReactNode;
};
function RiskView({
  risk,
  kind,
}: {
  risk: Risk;
  kind: "psychosis" | "seizure";
}) {
  const t = useT();
  const psychosis = kind === "psychosis";
  return (
    <section className="theme-section-group-divider space-y-4">
      <ArticleSubsectionHeader
        icon={psychosis ? "tabler:mood-crazy-happy" : "mage:zap"}
        heading={psychosis ? t("Psychosis Risk") : t("Seizure Risk")}
        headingClassName="text-lg font-bold leading-7 tracking-tight sm:text-xl sm:leading-8"
        iconClassName="scale-110"
      >
        <RiskLevelBadge level={risk.level} />
      </ArticleSubsectionHeader>
      {risk.content}
    </section>
  );
}
export function PsychosisRiskSubsectionView({ risk }: { risk: Risk }) {
  return <RiskView risk={risk} kind="psychosis" />;
}
export function SeizureRiskSubsectionView({ risk }: { risk: Risk }) {
  return <RiskView risk={risk} kind="seizure" />;
}
