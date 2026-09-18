import { memo, type ReactNode } from "react";
import { ArticleContributorAttribution } from "@/components/layout/ArticleContributorAttribution.client";
import { msg } from "@/i18n/messages";
import type { SubstanceArticle } from "@/schema";
import { SENSORY_CATEGORIES } from "@/data/subjectiveEffectSubcategories";
import { EditableSlot, EditableValue, buildFieldPath } from "../../editing";
import { ArticleText } from "../CitedText";
import { ArticleGapNotice } from "./ArticleGapNotice";
import { hasEffects, hasSenseEffects } from "./subjectiveEffectsModel";
import {
  SubjectiveEffectsOverviewFallback,
  SubjectiveEffectsSectionView,
} from "./SubjectiveEffectsSectionView.client";

interface SubjectiveEffectsSectionProps {
  article: SubstanceArticle;
  onSelectEffect?: (effect: string) => void;
  attributionHref?: string | null;
  attributionSection?: ReactNode;
  replicationShowcaseSection?: ReactNode;
}

function isArchivedSubjectiveEffectsAttribution({
  author,
  url,
}: {
  author: string;
  url?: string;
}) {
  return (
    author === "Josie Kins" &&
    typeof url === "string" &&
    url.startsWith("https://web.archive.org/web/")
  );
}

export function SubjectiveEffectsAttribution({
  article,
  attributionHref,
  hasShowcase,
}: {
  article: SubstanceArticle;
  attributionHref?: string | null;
  hasShowcase: boolean;
}) {
  const attribution = article.subjective_effects.attribution;
  if (!attribution || /\bAI editorial pipeline\b/i.test(attribution.author))
    return null;
  const { author, text, url } = attribution;
  const contributorPath = isArchivedSubjectiveEffectsAttribution({
    author,
    url,
  })
    ? url
    : (attributionHref ?? undefined);
  return (
    <ArticleContributorAttribution
      className={hasShowcase ? "mt-4 mb-6" : "mt-4"}
      author={author}
      authorHref={contributorPath}
      avatarSrc={
        author === "Josie Kins"
          ? "/profile-avatars/josie/avatar.webp"
          : undefined
      }
      text={text}
      url={url}
    />
  );
}

function effectNoteContent({
  value,
  path,
  label,
  emptyLabel,
  labelValues,
}: {
  value?: string;
  path: string;
  label: string;
  emptyLabel: string;
  labelValues?: Record<string, string | number>;
}) {
  return value?.trim() ? (
    <EditableValue
      as="div"
      label={label}
      labelValues={labelValues}
      path={path}
      value={value}
    >
      <p className="theme-text-muted text-sm leading-relaxed">{value}</p>
    </EditableValue>
  ) : (
    <EditableSlot
      emptyLabel={emptyLabel}
      label={label}
      labelValues={labelValues}
      path={path}
      value={value ?? ""}
    />
  );
}

/** Server-compatible projection boundary around the interactive effect controls. */
export const SubjectiveEffectsSection = memo(function SubjectiveEffectsSection({
  article,
  onSelectEffect,
  attributionHref,
  attributionSection,
  replicationShowcaseSection,
}: SubjectiveEffectsSectionProps) {
  const { subjective_effects: effects, comparisons } = article;
  const hasContent =
    SENSORY_CATEGORIES.some(({ key }) =>
      hasSenseEffects(effects.sensory[key as keyof typeof effects.sensory]),
    ) ||
    hasEffects(effects.cognitive) ||
    hasEffects(effects.physical) ||
    hasEffects(effects.progressive_stages) ||
    comparisons.length > 0 ||
    Boolean(effects.notes?.overview?.trim()) ||
    effects.is_stub === true;

  if (!hasContent) {
    return <ArticleGapNotice article={article} section="subjective_effects" />;
  }

  const resolvedAttribution = attributionSection ?? (
    <SubjectiveEffectsAttribution
      article={article}
      attributionHref={attributionHref}
      hasShowcase={Boolean(replicationShowcaseSection)}
    />
  );

  const overviewNote = effects.notes?.overview ?? "";
  const overviewContent = (
    <EditableValue
      as="div"
      emptyLabel={msg("Add an overview note")}
      label={msg("Subjective effects overview")}
      path="subjective_effects.notes.overview"
      value={overviewNote}
    >
      <ArticleText cited={false} tone="muted">
        {overviewNote.trim() || <SubjectiveEffectsOverviewFallback />}
      </ArticleText>
    </EditableValue>
  );
  const physicalNoteContent = effectNoteContent({
    value: effects.notes?.physical,
    path: "subjective_effects.notes.physical",
    label: msg("Physical effects note"),
    emptyLabel: msg("Add a physical effects note"),
  });
  const cognitiveNoteContent = effectNoteContent({
    value: effects.notes?.cognitive,
    path: "subjective_effects.notes.cognitive",
    label: msg("Cognitive effects note"),
    emptyLabel: msg("Add a cognitive effects note"),
  });
  const sensoryNoteContent = Object.fromEntries(
    SENSORY_CATEGORIES.map(({ key, label }) => {
      const value = effects.sensory[key as keyof typeof effects.sensory]?.note;
      return [
        key,
        effectNoteContent({
          value,
          path: buildFieldPath("subjective_effects", "sensory", key, "note"),
          label: msg("{{label}} note"),
          labelValues: { label },
          emptyLabel: msg("Add a {{label}} note"),
        }),
      ];
    }),
  );
  const comparisonsContent = comparisons.length ? (
    <ul className="space-y-3">
      {comparisons.map((item, index) => (
        <li key={index} className="text-sm leading-relaxed">
          <span className="theme-accent-heading font-medium">{item.drug}</span>
          <span className="theme-text-faint"> — </span>
          <span className="theme-text-secondary">{item.comparison}</span>
        </li>
      ))}
    </ul>
  ) : undefined;
  const projectedEffects = {
    ...effects,
    notes: { overview: "", sensory: "", cognitive: "", physical: "" },
    attribution: null,
    source_overview: undefined,
    sensory: Object.fromEntries(
      Object.entries(effects.sensory).map(([key, category]) => [
        key,
        { ...category, note: "" },
      ]),
    ) as typeof effects.sensory,
  };

  return (
    <SubjectiveEffectsSectionView
      projection={{
        subjective_effects: projectedEffects,
        classification: article.classification,
        title: article.title,
      }}
      onSelectEffect={onSelectEffect}
      attributionSection={resolvedAttribution}
      replicationShowcaseSection={replicationShowcaseSection}
      overviewContent={overviewContent}
      physicalNoteContent={physicalNoteContent}
      cognitiveNoteContent={cognitiveNoteContent}
      sensoryNoteContent={sensoryNoteContent}
      comparisonsContent={comparisonsContent}
    />
  );
});
