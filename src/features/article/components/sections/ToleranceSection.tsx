"use client";

import { memo } from "react";
import Masonry from "react-masonry-css";
import {
  ArticleInfoCard,
  ArticleSection,
} from "@/components/common/ArticleSection";
import type { IconName } from "@/components/common/Icon";
import type { SubstanceArticle } from "@/schema";
import { EditableSlot, EditableValue, buildFieldPath } from "../../editing";
import { ArticleText, CitedText } from "../CitedText";
import { ArticleGapNotice } from "./ArticleGapNotice";

const MASONRY_BREAKPOINTS = {
  default: 2,
  640: 1,
};

interface ToleranceSectionProps {
  article: SubstanceArticle;
}

const TOLERANCE_ITEMS: Array<{ key: string; label: string; icon: IconName }> = [
  { key: "full_tolerance", label: "Full Tolerance", icon: "lucide:arrow-up-wide-narrow" },
  { key: "half_tolerance", label: "Half Tolerance", icon: "lucide:circle-slash-2" },
  { key: "baseline_tolerance", label: "Baseline Reset", icon: "lucide:arrow-down-wide-narrow" },
];

export const ToleranceSection = memo(function ToleranceSection({
  article,
}: ToleranceSectionProps) {
  const { tolerance } = article;

  const hasFull = tolerance?.full_tolerance?.trim().length > 0;
  const hasHalf = tolerance?.half_tolerance?.trim().length > 0;
  const hasBaseline = tolerance?.baseline_tolerance?.trim().length > 0;
  const hasCross = tolerance?.cross_tolerance?.length > 0;

  if (!hasFull && !hasHalf && !hasBaseline && !hasCross) {
    return <ArticleGapNotice article={article} section="tolerance" />;
  }

  return (
    <ArticleSection id="tolerance" icon="lucide:trending-up" heading="Tolerance">
      <Masonry
        breakpointCols={MASONRY_BREAKPOINTS}
        className="flex w-full gap-4"
        columnClassName="flex flex-col gap-4"
      >
        {TOLERANCE_ITEMS.map(({ key, label, icon }) => {
          const value = tolerance[key as keyof typeof tolerance];
          if (typeof value !== "string" || value.trim().length === 0) return null;

          return (
            <ArticleInfoCard
              key={key}
              icon={icon}
              padding="sm"
              variant="nested"
              title={label}
              tone="accent"
            >
              <EditableValue
                as="div"
                label={label}
                path={`tolerance.${key}`}
                value={value}
              >
                <ArticleText
                  article={article}
                  as="div"
                  text={value}
                />
              </EditableValue>
            </ArticleInfoCard>
          );
        })}

        {/* Cross Tolerance */}
        {hasCross && (
          <ArticleInfoCard
            icon="lucide:merge"
            padding="sm"
            variant="nested"
            title="Cross Tolerance"
            tone="accent"
          >
            <p>
              {tolerance.cross_tolerance.map((entry, index) => (
                <span key={`${entry}-${index}`}>
                  {index > 0 ? ", " : null}
                  <EditableValue
                    label={`Cross tolerance entry ${index + 1}`}
                    path={buildFieldPath("tolerance", "cross_tolerance", index)}
                    value={entry}
                  >
                    <CitedText text={entry} article={article} />
                  </EditableValue>
                </span>
              ))}
            </p>
          </ArticleInfoCard>
        )}
      </Masonry>

      {/* Empty-field prompts sit *outside* the masonry on purpose: it hands its
          children to columns by index, so an element that renders nothing would
          still shift which card lands in which column on the public page. */}
      {TOLERANCE_ITEMS.map(({ key, label }) => {
        const value = tolerance[key as keyof typeof tolerance];
        if (typeof value === "string" && value.trim().length > 0) return null;

        return (
          <EditableSlot
            emptyLabel={`Add ${label.toLowerCase()}`}
            key={key}
            label={label}
            path={buildFieldPath("tolerance", key)}
            value={typeof value === "string" ? value : ""}
          />
        );
      })}
    </ArticleSection>
  );
});
