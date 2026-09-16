import { memo } from "react";
import type { IconName } from "@/components/common/Icon";
import type { SubstanceArticle } from "@/schema";
import { msg } from "@/i18n/messages";
import { EditableSlot, EditableValue, buildFieldPath } from "../../editing";
import { ArticleText, CitedText } from "../CitedText";
import { ArticleGapNotice } from "./ArticleGapNotice";
import { TOLERANCE_SECTION_DISCLAIMER_FALLBACK } from "./articleDisclaimerCopy";
import { ToleranceSectionView } from "./ToleranceSectionView.client";

interface ToleranceSectionProps {
  article: SubstanceArticle;
  disclaimer?: string;
}
const TOLERANCE_ITEMS: Array<{ key: string; label: string; icon: IconName }> = [
  {
    key: "full_tolerance",
    label: msg("Full Tolerance"),
    icon: "lucide:arrow-up-wide-narrow",
  },
  {
    key: "half_tolerance",
    label: msg("Half Tolerance"),
    icon: "lucide:circle-slash-2",
  },
  {
    key: "baseline_tolerance",
    label: msg("Baseline Reset"),
    icon: "lucide:arrow-down-wide-narrow",
  },
];

export const ToleranceSection = memo(function ToleranceSection({
  article,
  disclaimer = TOLERANCE_SECTION_DISCLAIMER_FALLBACK,
}: ToleranceSectionProps) {
  const tolerance = article.tolerance;
  const cards = TOLERANCE_ITEMS.flatMap(({ key, label, icon }) => {
    const value = tolerance?.[key as keyof typeof tolerance];
    if (typeof value !== "string" || value.trim().length === 0) return [];
    return [
      {
        key,
        label,
        icon,
        content: (
          <EditableValue
            as="div"
            label={label}
            path={`tolerance.${key}`}
            value={value}
          >
            <ArticleText article={article} as="div" text={value} />
          </EditableValue>
        ),
      },
    ];
  });
  const cross = tolerance?.cross_tolerance ?? [];
  if (cards.length === 0 && cross.length === 0)
    return <ArticleGapNotice article={article} section="tolerance" />;
  if (cross.length > 0)
    cards.push({
      key: "cross-tolerance",
      label: msg("Cross Tolerance"),
      icon: "lucide:merge",
      content: (
        <p>
          {cross.map((value, index) => (
            <span key={`${value}-${index}`}>
              {index > 0 ? ", " : null}
              <EditableValue
                label={msg("Cross tolerance entry {{n}}")}
                labelValues={{ n: index + 1 }}
                path={buildFieldPath("tolerance", "cross_tolerance", index)}
                value={value}
              >
                <CitedText text={value} article={article} />
              </EditableValue>
            </span>
          ))}
        </p>
      ),
    });
  const emptySlots = TOLERANCE_ITEMS.flatMap(({ key, label }) => {
    const value = tolerance?.[key as keyof typeof tolerance];
    if (typeof value === "string" && value.trim().length > 0) return [];
    return [
      <EditableSlot
        emptyLabel={msg("Add {{label}}")}
        labelValues={{ label }}
        key={key}
        label={label}
        path={buildFieldPath("tolerance", key)}
        value={typeof value === "string" ? value : ""}
      />,
    ];
  });
  return (
    <ToleranceSectionView
      cards={cards}
      emptySlots={emptySlots}
      disclaimer={disclaimer}
    />
  );
});
