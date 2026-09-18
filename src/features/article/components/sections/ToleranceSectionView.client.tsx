"use client";

import type { ReactNode } from "react";
import Masonry from "react-masonry-css";
import {
  ArticleInfoCard,
  ArticleSection,
} from "@/components/common/ArticleSection";
import type { IconName } from "@/components/common/Icon";
import { SUBSTANCE_SECTION_ICONS } from "@/schema/substance/sectionManifest";
import { useT } from "@/i18n/client";
import { ArticleDisclaimer } from "./ArticleDisclaimer";

const MASONRY_BREAKPOINTS = { default: 2, 640: 1 };
export interface ToleranceCardViewModel {
  key: string;
  label: string;
  icon: IconName;
  content: ReactNode;
}

interface ToleranceSectionViewProps {
  cards: ToleranceCardViewModel[];
  emptySlots: ReactNode[];
  disclaimer: string;
}

export function ToleranceSectionView({
  cards,
  emptySlots,
  disclaimer,
}: ToleranceSectionViewProps) {
  const t = useT();
  return (
    <ArticleSection
      id="tolerance"
      icon={SUBSTANCE_SECTION_ICONS.tolerance}
      heading={t("Tolerance")}
    >
      <ArticleDisclaimer text={t(disclaimer)} />
      <Masonry
        breakpointCols={MASONRY_BREAKPOINTS}
        className="flex w-full gap-4"
        columnClassName="flex flex-col gap-4"
      >
        {cards.map(({ key, label, icon, content }) => (
          <ArticleInfoCard
            key={key}
            icon={icon}
            padding="sm"
            variant="nested"
            title={t(label)}
            tone="accent"
          >
            {content}
          </ArticleInfoCard>
        ))}
      </Masonry>
      {emptySlots}
    </ArticleSection>
  );
}
