"use client";

import Link from "next/link";
import { memo } from "react";
import { ArticleSection } from "@/components/common/ArticleSection";
import { Icon } from "@/components/common/Icon";
import { Badge } from "@/components/ui/badge";
import type { SectionGapNeighbour, SubstanceArticle } from "@/schema";
import {
  ARTICLE_GAP_ORDER,
  ARTICLE_GAP_POLICIES,
  buildArticleGapCopy,
  buildArticleStubCopy,
  resolveGap,
  type ArticleGapPolicyKey,
} from "./articleGapCopy";

export const GAP_ICON = "qlementine-icons:empty-slot-16";
export const STUB_ICON = "ph:egg-crack-light";

/** An article shows the stub banner once this many editorial sections are empty. */
export const STUB_THRESHOLD = 3;

function NeighbourChips({ neighbours }: { neighbours: SectionGapNeighbour[] }) {
  if (neighbours.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {neighbours.map((neighbour) => (
        <Link
          key={neighbour.slug}
          href={`/${neighbour.slug}`}
          title={neighbour.note}
          className="focus-visible:outline-none"
        >
          <Badge variant="interactive" className="text-xs normal-case tracking-normal">
            {neighbour.name}
          </Badge>
        </Link>
      ))}
    </span>
  );
}

export interface ArticleGapNoticeProps {
  article: SubstanceArticle;
  section: ArticleGapPolicyKey;
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
}: ArticleGapNoticeProps) {
  const policy = ARTICLE_GAP_POLICIES[section];
  const gap = resolveGap(article, policy);
  const copy = buildArticleGapCopy(policy, gap);

  return (
    <ArticleSection id={policy.id} icon={policy.icon} heading={policy.label}>
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
        {copy.caution ? (
          <>
            <span aria-hidden className="theme-divider mt-2 block h-px" />
            <p className="theme-text-faint pt-2 text-xs">{copy.caution}</p>
          </>
        ) : null}
      </div>
    </ArticleSection>
  );
});

export interface ArticleStubBannerProps {
  missing: ArticleGapPolicyKey[];
}

/** Shown above the article body when at least STUB_THRESHOLD sections are empty. */
export const ArticleStubBanner = memo(function ArticleStubBanner({
  missing,
}: ArticleStubBannerProps) {
  if (missing.length < STUB_THRESHOLD) return null;

  return (
    <div
      role="status"
      className="theme-article-subsection-card flex flex-wrap items-center gap-x-3 gap-y-2 rounded-full border px-4 py-2.5"
      title={buildArticleStubCopy(missing.length, ARTICLE_GAP_ORDER.length)}
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
