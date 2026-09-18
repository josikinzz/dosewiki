"use client";

import type { ReactNode } from "react";
import { ArticleSection } from "@/components/common/ArticleSection";
import { SUBSTANCE_SECTION_ICONS } from "@/schema/substance/sectionManifest";
import { useT } from "@/i18n/client";

export function HarmPotentialSectionView({
  summary,
  children,
}: {
  summary?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <ArticleSection
      id="harm-potential"
      icon={SUBSTANCE_SECTION_ICONS["harm-potential"]}
      heading={t("Harm Potential")}
    >
      {summary}
      <div className="space-y-8">{children}</div>
    </ArticleSection>
  );
}
