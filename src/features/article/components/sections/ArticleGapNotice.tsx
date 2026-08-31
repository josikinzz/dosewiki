"use client";

import { SmartLink } from "@/components/common/SmartLink";
import { memo, type ReactNode } from "react";
import { ArticleSection } from "@/components/common/ArticleSection";
import { Icon } from "@/components/common/Icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SectionGapNeighbour, SubstanceArticle } from "@/schema";
import { getArticleStubVerdict } from "@/schema/substance/articleStubPolicy";
import { SUBSTANCE_SECTION_ICONS } from "@/schema/substance/sectionManifest";
import {
  ARTICLE_GAP_ORDER,
  ARTICLE_GAP_POLICIES,
  SUBSECTION_GAP_POLICIES,
  buildArticleGapCopy,
  buildArticleStubCopy,
  buildSubsectionGapCopy,
  resolveGap,
  resolveSubsectionGapReason,
  type ArticleGapPolicyKey,
  type SubsectionGapPolicyKey,
} from "./articleGapCopy";
import { getEmptyArticleSectionKeys } from "./articleGapPresence";

export const GAP_ICON = "qlementine-icons:empty-slot-16";
export const STUB_ICON = "ph:egg-crack-light";

/**
 * The stub rule lives in the schema layer so the article banner, the coverage
 * audit, and any tooling read the same verdict.
 */
export { STUB_THRESHOLD } from "@/schema/substance/articleStubPolicy";

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
          <Badge variant="interactive" className="text-xs normal-case tracking-normal">
            {neighbour.name}
          </Badge>
        </SmartLink>
      ))}
    </span>
  );
}

export interface ArticleGapNoticeProps {
  article: SubstanceArticle;
  section: ArticleGapPolicyKey;
  /**
   * Rendered under the card, for sections whose absence should still hand the
   * reader somewhere to go — the interactions source pill, for instance.
   */
  footer?: ReactNode;
}

/**
 * Rendered in place of a section that has no published content.
 *
 * An empty section that simply disappears is indistinguishable from one nobody
 * has started. Stating the absence — and pointing at better-documented
 * neighbours where that is defensible — is the more useful and more honest
 * outcome, so every editorial section renders this instead of returning null.
 */
export const ArticleGapNotice = memo(function ArticleGapNotice({
  article,
  section,
  footer,
}: ArticleGapNoticeProps) {
  const policy = ARTICLE_GAP_POLICIES[section];
  const gap = resolveGap(article, policy);
  const copy = buildArticleGapCopy(policy, gap);
  const closingNote = [copy.caution, copy.lookElsewhere].filter(Boolean).join(" ");

  return (
    <ArticleSection
      id={policy.id}
      icon={SUBSTANCE_SECTION_ICONS[policy.id]}
      heading={policy.label}
    >
      <div className="theme-article-subsection-card rounded-2xl border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="flex min-w-0 items-center gap-3">
            <Icon icon={GAP_ICON} size={24} className="theme-icon-accent shrink-0" />
            <span className="min-w-0">
              <span className="theme-text-primary block text-sm font-semibold">{copy.title}</span>
              {copy.lead ? (
                <span className="theme-text-faint block text-xs">{copy.lead}</span>
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

export interface ArticleSubsectionGapProps {
  article: SubstanceArticle;
  /** Slots to mark empty, in the order the filled versions would have appeared. */
  slots: SubsectionGapPolicyKey[];
  /** Gap key of the section this subsection belongs to, for reason fallback. */
  parentGapKey: string;
  className?: string;
}

/**
 * The quietest of the three absence notices: one chip per empty slot inside a
 * subsection that does have other content.
 *
 * Weight tracks scope. The stub banner qualifies a whole article and gets a
 * solid pill in the hero; the section gap notice replaces a section and gets a
 * frosted card; a single unrecorded fact gets neither fill nor shadow — a
 * hairline chip that shrinks to its text, so it reads as a marker sitting in
 * the section rather than as another panel competing with it. The eyebrow label
 * and 15px muted icon are the same idiom the collapsed pharmacology toggles
 * use, which is what an unfilled slot should look like: the filled control,
 * minus the affordance.
 *
 * Rendered as a group so both chips sit on one line when both slots are empty,
 * which is the common case and the one most at risk of reading as clutter.
 */
export const ArticleSubsectionGapNotice = memo(function ArticleSubsectionGapNotice({
  article,
  slots,
  parentGapKey,
  className,
}: ArticleSubsectionGapProps) {
  if (slots.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {slots.map((slot) => {
        const policy = SUBSECTION_GAP_POLICIES[slot];
        const copy = buildSubsectionGapCopy(
          policy,
          resolveSubsectionGapReason(article, policy, parentGapKey),
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
});

export interface ArticleStubBannerProps {
  article: SubstanceArticle;
  className?: string;
}

/**
 * Shown under the article title when the article reads as a stub.
 *
 * The verdict is `getArticleStubVerdict`'s, not a count taken here: an article
 * that publishes no dose ranges or durations is a stub however much prose the
 * rest of it carries. The badges stay a plain list of the empty sections, which
 * on a no-dosage stub can be shorter than the section-count threshold.
 */
export const ArticleStubBanner = memo(function ArticleStubBanner({
  article,
  className,
}: ArticleStubBannerProps) {
  const verdict = getArticleStubVerdict(article);
  if (!verdict.isStub) return null;

  const missing: ArticleGapPolicyKey[] = getEmptyArticleSectionKeys(article);

  return (
    <div
      role="status"
      className={cn(
        "theme-article-stub-banner flex flex-wrap items-center gap-x-3 gap-y-2 rounded-full border px-4 py-2.5",
        className,
      )}
      title={buildArticleStubCopy(verdict, ARTICLE_GAP_ORDER.length)}
    >
      <Icon icon={STUB_ICON} size={22} className="theme-icon-accent shrink-0" />
      <span className="theme-text-primary text-sm font-semibold">This article is a stub</span>
      <span className="theme-text-faint text-xs">missing:</span>
      <span className="flex flex-wrap gap-1.5">
        {missing.map((key) => (
          <Badge
            key={key}
            variant="outline"
            className="text-[11px] normal-case tracking-normal"
          >
            {ARTICLE_GAP_POLICIES[key].label}
          </Badge>
        ))}
      </span>
    </div>
  );
});
