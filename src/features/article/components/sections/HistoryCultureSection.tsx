import { Fragment, memo, type ReactNode } from "react";
import type { SubstanceArticle } from "@/schema";
import { buildFieldPath, EditableValue } from "../../editing";
import { renderCitedText } from "../CitedText";
import { ArticleGapNotice } from "./ArticleGapNotice";
import { getIconForHistoryHeading } from "./historyCultureIcons";
import type {
  HistoryCultureViewModel,
  HistorySectionViewModel,
} from "./historyCultureModel";
import {
  needsTruncation,
  renderWithBoldYears,
  truncateContent,
} from "./historyCultureText";
import { HistoryCultureSectionView } from "./HistoryCultureSectionView.client";

interface HistoryCultureSectionProps {
  article: SubstanceArticle;
}

function renderHistoryText(text: string, article: SubstanceArticle): ReactNode {
  return renderCitedText(text, article).map((node, index) =>
    typeof node === "string" ? (
      <Fragment key={`history-text-${index}`}>
        {renderWithBoldYears(node)}
      </Fragment>
    ) : (
      node
    ),
  );
}

function renderEditableHistoryText({
  article,
  label,
  labelValues,
  path,
  value,
}: {
  article: SubstanceArticle;
  label: string;
  labelValues?: Record<string, string>;
  path: string;
  value: string;
}) {
  return (
    <EditableValue
      as="span"
      label={label}
      labelValues={labelValues}
      path={path}
      value={value}
    >
      {renderHistoryText(value, article)}
    </EditableValue>
  );
}

/** Server-compatible projection boundary around the interactive history layout. */
export const HistoryCultureSection = memo(function HistoryCultureSection({
  article,
}: HistoryCultureSectionProps) {
  const { history_culture: historyCulture } = article;

  if (!historyCulture) {
    return <ArticleGapNotice article={article} section="history_culture" />;
  }

  const hasContent = historyCulture.content?.trim().length > 0;
  const sections = (historyCulture.sections ?? [])
    .map((section, originalIndex) => ({
      section,
      originalIndex,
      isNotableIndividuals: section.heading.trim() === "Notable Individuals",
    }))
    .filter(({ section }) => {
      const hasHeading = section.heading.trim().length > 0;
      const hasSectionContent = section.content.trim().length > 0;
      const hasSubsections = Boolean(section.subsections?.length);
      return hasHeading && (hasSectionContent || hasSubsections);
    })
    .sort(
      (left, right) =>
        Number(left.isNotableIndividuals) - Number(right.isNotableIndividuals),
    );

  if (!hasContent && sections.length === 0) {
    return <ArticleGapNotice article={article} section="history_culture" />;
  }

  const firstSection = sections[0];
  const sectionsNeedTruncation =
    sections.length > 0 &&
    (sections.length > 1 ||
      (firstSection && needsTruncation(firstSection.section.content)) ||
      Boolean(firstSection?.section.subsections?.length));

  const projectedSections: HistorySectionViewModel[] = sections.map(
    (entry, displayIndex) => {
      const { section, originalIndex, isNotableIndividuals } = entry;
      const isCollapsedTruncated =
        displayIndex === 0 &&
        section.content.trim().length > 0 &&
        needsTruncation(section.content);
      const contentPath = buildFieldPath(
        "history_culture",
        "sections",
        originalIndex,
        "content",
      );
      const fullContent = renderEditableHistoryText({
        article,
        label: "{{heading}} history content",
        labelValues: { heading: section.heading },
        path: contentPath,
        value: section.content,
      });
      // Collapsed, the first section shows a `truncateContent` preview. An
      // editor opened on a preview is one keystroke from saving the cut text
      // over the stored prose, so the editable node is used only while the
      // preview is the whole field. The ellipsis keeps its own rule.
      const collapsedText =
        displayIndex === 0 ? truncateContent(section.content) : section.content;
      const collapsedContent =
        collapsedText === section.content
          ? fullContent
          : renderHistoryText(collapsedText, article);

      return {
        collapsedContent,
        fullContent,
        hasContent: section.content.trim().length > 0,
        heading: section.heading,
        icon: getIconForHistoryHeading(section.heading),
        id: `history-section-${originalIndex}`,
        isCollapsedTruncated,
        isNotableIndividuals,
        subsections: (section.subsections ?? []).map(
          (subsection, subsectionIndex) => ({
            content: renderEditableHistoryText({
              article,
              label: isNotableIndividuals
                ? "{{name}} biography"
                : "{{heading}} history content",
              labelValues: isNotableIndividuals
                ? { name: subsection.heading }
                : { heading: subsection.heading },
              path: buildFieldPath(
                "history_culture",
                "sections",
                originalIndex,
                "subsections",
                subsectionIndex,
                "content",
              ),
              value: subsection.content,
            }),
            heading: subsection.heading,
            id: `history-individual-${originalIndex}-${subsectionIndex}`,
          }),
        ),
      };
    },
  );

  const model: HistoryCultureViewModel = {
    sections: projectedSections,
    sectionsNeedTruncation,
  };

  if (hasContent && sections.length > 0) {
    model.overview = renderEditableHistoryText({
      article,
      label: "History & culture overview",
      path: "history_culture.content",
      value: historyCulture.content,
    });
  } else if (hasContent) {
    const rawValue = historyCulture.content;
    const isTruncated = needsTruncation(rawValue);
    const fullContent = renderEditableHistoryText({
      article,
      label: "History & culture overview",
      path: "history_culture.content",
      value: rawValue,
    });
    model.freeform = {
      collapsedContent: isTruncated
        ? renderHistoryText(truncateContent(rawValue), article)
        : fullContent,
      fullContent,
      isTruncated,
    };
  }

  return <HistoryCultureSectionView model={model} />;
});
