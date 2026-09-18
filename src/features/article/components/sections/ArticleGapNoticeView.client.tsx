"use client";

import { SmartLink } from "@/components/common/SmartLink";
import { memo, type ReactNode } from "react";
import { ArticleSection } from "@/components/common/ArticleSection";
import { Icon } from "@/components/common/Icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import type { SectionGapNeighbour, SectionGapReason } from "@/schema";
import type { ArticleStubVerdict } from "@/schema/substance/articleStubPolicy";
import { SUBSTANCE_SECTION_ICONS } from "@/schema/substance/sectionManifest";
import {
  ARTICLE_GAP_ORDER,
  ARTICLE_GAP_POLICIES,
  SUBSECTION_GAP_POLICIES,
  buildArticleGapCopy,
  buildArticleStubCopy,
  buildSubsectionGapCopy,
  type ArticleGapPolicyKey,
  type ResolvedGap,
  type SubsectionGapPolicyKey,
} from "./articleGapCopy";

const GAP_ICON = "qlementine-icons:empty-slot-16";
const STUB_ICON = "ph:egg-crack-light";

function NeighbourChips({ neighbours }: { neighbours: SectionGapNeighbour[] }) {
  if (neighbours.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {neighbours.map((neighbour) => (
        <SmartLink
          key={neighbour.slug}
          href={`/${neighbour.slug}`}
          title={neighbour.note}
          className="focus-visible:outline-none"
        >
          <Badge
            variant="interactive"
            className="text-xs normal-case tracking-normal"
          >
            {neighbour.name}
          </Badge>
        </SmartLink>
      ))}
    </span>
  );
}

export const ArticleGapNoticeView = memo(function ArticleGapNoticeView({
  section,
  gap,
  footer,
}: {
  section: ArticleGapPolicyKey;
  gap: ResolvedGap;
  footer?: ReactNode;
}) {
  const t = useT();
  const policy = ARTICLE_GAP_POLICIES[section];
  const copy = buildArticleGapCopy(t, policy, gap);
  const closingNote = [copy.caution, copy.lookElsewhere]
    .filter(Boolean)
    .join(" ");
  return (
    <ArticleSection
      id={policy.id}
      icon={SUBSTANCE_SECTION_ICONS[policy.id]}
      heading={t(policy.label)}
    >
      <div className="theme-article-subsection-card rounded-2xl border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="flex min-w-0 items-center gap-3">
            <Icon
              icon={GAP_ICON}
              size={24}
              className="theme-icon-accent shrink-0"
            />
            <span className="min-w-0">
              <span className="theme-text-primary block text-sm font-semibold">
                {copy.title}
              </span>
              {copy.lead ? (
                <span className="theme-text-faint block text-xs">
                  {copy.lead}
                </span>
              ) : null}
            </span>
          </span>
          <NeighbourChips neighbours={gap.neighbours} />
        </div>
        {closingNote ? (
          <>
            <span aria-hidden className="theme-divider mt-2 block h-px" />
            <p className="theme-text-faint pt-2 text-xs">{closingNote}</p>
          </>
        ) : null}
      </div>
      {footer}
    </ArticleSection>
  );
});

export function ArticleSubsectionGapNoticeView({
  slots,
  reasons,
  className,
}: {
  slots: SubsectionGapPolicyKey[];
  reasons: SectionGapReason[];
  className?: string;
}) {
  const t = useT();
  if (slots.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {slots.map((slot, index) => {
        const copy = buildSubsectionGapCopy(
          t,
          SUBSECTION_GAP_POLICIES[slot],
          reasons[index],
        );
        return (
          <span
            key={slot}
            role="note"
            className="theme-article-gap-slot inline-flex items-center gap-2 rounded-full border px-3 py-1"
          >
            <Icon
              icon={GAP_ICON}
              size={15}
              aria-hidden
              className="theme-icon-muted shrink-0"
            />
            <span className="theme-text-secondary text-xs font-semibold uppercase tracking-wide">
              {copy.label}
            </span>
            <span aria-hidden className="theme-text-faint text-xs">
              ·
            </span>
            <span className="theme-text-faint text-xs">{copy.status}</span>
          </span>
        );
      })}
    </div>
  );
}

export function ArticleStubBannerView({
  verdict,
  missing,
  className,
}: {
  verdict: ArticleStubVerdict;
  missing: ArticleGapPolicyKey[];
  className?: string;
}) {
  const t = useT();
  return (
    <div
      role="status"
      className={cn(
        "theme-article-stub-banner flex flex-wrap items-center gap-x-3 gap-y-2 rounded-full border px-4 py-2.5",
        className,
      )}
      title={buildArticleStubCopy(t, verdict, ARTICLE_GAP_ORDER.length)}
    >
      <Icon icon={STUB_ICON} size={22} className="theme-icon-accent shrink-0" />
      <span className="theme-text-primary text-sm font-semibold">
        {t("This article is a stub")}
      </span>
      <span className="theme-text-faint text-xs">{t("missing:")}</span>
      <span className="flex flex-wrap gap-1.5">
        {missing.map((key) => (
          <Badge
            key={key}
            variant="outline"
            className="text-[11px] normal-case tracking-normal"
          >
            {t(ARTICLE_GAP_POLICIES[key].label)}
          </Badge>
        ))}
      </span>
    </div>
  );
}
