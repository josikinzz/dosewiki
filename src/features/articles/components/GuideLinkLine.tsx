"use client";

import { SmartLink } from "@/components/common/SmartLink";
import { Fragment } from "react";
import { useT } from "@/i18n/client";
import { Icon } from "@/components/common/Icon";
import { quietLinkClassName } from "@/components/common/ProseLink";
import { cn } from "@/lib/utils";
import {
  articleHref,
  type ArticleGuideLink,
  type SummaryCaption,
} from "../domain/articleGuides";

interface GuideLinkLineProps {
  /** The class's intensity scale, which grades every substance in the class. */
  scale?: ArticleGuideLink;
  /**
   * The long-form guide for this exact substance, when the page is that
   * substance's own. Callers resolve it with `resolveSubstanceGuide`; a page
   * that is not the guide's subject passes nothing, because a guide to one drug
   * is not reading for another.
   */
  guide?: ArticleGuideLink;
  /**
   * The class's general effect descriptions, as `buildSummaryCaption` reads
   * them. They describe no single substance, so every substance in the class
   * carries them.
   */
  summaryCaption?: SummaryCaption;
  className?: string;
}

/**
 * The quiet see-also caption beside a substance's effects, an effect in a
 * class's family, or a class's category page: the writing that measures what
 * the page describes.
 *
 * Same register as `SEIRoadmapNotice`, which sits directly above it on a
 * substance article: faint text, a leading hairline icon, and links that stay
 * at secondary weight rather than shouting in accent. Two captions in a row
 * that were styled differently read as two unrelated warnings.
 *
 * A client component so `useT` can pick the mirror's language; its props are
 * plain data, so server pages render it as they always have.
 */
export function GuideLinkLine({ scale, guide, summaryCaption, className }: GuideLinkLineProps) {
  const t = useT();
  // Order runs from the most specific reading to the most general: the scale
  // that measures this experience, the guide to this exact substance, then the
  // class descriptions that hold for every substance in it.
  const articleEntries = [
    ...(scale ? [{ href: articleHref(scale.slug), label: t(scale.title) }] : []),
    // "guide" is carried in the label because the title alone ("DXM") reads as
    // a link to the substance rather than to the writing.
    ...(guide ? [{ href: articleHref(guide.slug), label: t("{{title}} guide", { title: guide.title }) }] : []),
  ];
  const summaries = summaryCaption?.entries ?? [];
  const groupLabel = summaryCaption?.groupLabel;
  // Ungrouped summaries are ordinary entries; a group renders as one clause.
  const entries = groupLabel
    ? articleEntries
    : [...articleEntries, ...summaries.map(({ href, title }) => ({ href, label: t(title) }))];
  if (entries.length === 0 && summaries.length === 0) return null;

  return (
    <p
      className={cn(
        // `flex`, not `inline-flex`: the roadmap notice directly above is
        // inline-flex for the centred SEI page, and two inline captions in a
        // row ran together into one sentence.
        "theme-text-faint flex items-start gap-1.5 text-xs leading-5 text-pretty",
        className,
      )}
    >
      <Icon
        icon="lucide:book-open-text"
        size="0.875rem"
        className="mt-[0.2rem] shrink-0"
        aria-hidden
      />
      <span>
        {t("See also:")}{" "}
        {entries.map((entry, index) => (
          <Fragment key={entry.href}>
            {index > 0 ? ", " : null}
            <SmartLink href={entry.href} className={quietLinkClassName}>
              {entry.label}
            </SmartLink>
          </Fragment>
        ))}
        {groupLabel ? (
          <>
            {entries.length > 0 ? ", " : null}
            {groupLabel}
            {" ("}
            {summaries.map((summary, index) => (
              <Fragment key={summary.href}>
                {index > 0 ? ", " : null}
                <SmartLink href={summary.href} className={quietLinkClassName}>
                  {t(summary.title)}
                </SmartLink>
              </Fragment>
            ))}
            {")"}
          </>
        ) : null}
      </span>
    </p>
  );
}
