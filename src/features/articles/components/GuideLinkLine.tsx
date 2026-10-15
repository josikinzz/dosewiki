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
  scale?: ArticleGuideLink;
  guide?: ArticleGuideLink;
  summaryCaption?: SummaryCaption;
  className?: string;
}

export function GuideLinkLine({ scale, guide, summaryCaption, className }: GuideLinkLineProps) {
  const t = useT();
  const articleEntries = [
    ...(scale ? [{ href: articleHref(scale.slug), label: t(scale.title) }] : []),
    ...(guide ? [{ href: articleHref(guide.slug), label: t("{{title}} guide", { title: guide.title }) }] : []),
  ];
  const summaries = summaryCaption?.entries ?? [];
  const groupLabel = summaryCaption?.groupLabel;
  const entries = groupLabel
    ? articleEntries
    : [...articleEntries, ...summaries.map(({ href, title }) => ({ href, label: t(title) }))];
  if (entries.length === 0 && summaries.length === 0) return null;

  return (
    <p
      className={cn(
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
