import "server-only";

import { Suspense, cache, type ComponentProps } from "react";
import { SmartLink } from "@/components/common/SmartLink";
import { t } from "@/i18n/server";
import { ArticleSection } from "@/components/common/ArticleSection";
import { PublicTableOfContents } from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";
import { EffectArticlePage, EffectCommentaryAttribution } from "@/features/effects/pages/EffectArticlePage";
import { EffectContributorsSection } from "@/features/effects/components/EffectContributorsSection";
import { RelatedSubstancesSection } from "@/features/effects/components/RelatedSubstancesSection";
import { getEffectArticleTocItems, type EffectArticleModel, type EffectArticleRichSectionModel } from "@/features/effects/articleSectionModel";
import { buildArtistCreditLinks, resolveArtistCreditLink } from "@/features/effects/vcode/artistCreditLinks";
import { getPublicArtistCreditRows, getPublicContributorDirectory } from "@server/data/publicData";
import { getPublicEffectDetail } from "@server/data/publicLibrary";

const getArtistLinks = cache(async () => buildArtistCreditLinks(await getPublicArtistCreditRows()));

async function ArtistCredit({ artist }: { artist: string }) {
  const credit = resolveArtistCreditLink(await getArtistLinks(), artist);
  if (!credit) return artist;
  const className = "underline decoration-current/40 underline-offset-2 transition-opacity hover:opacity-80";
  return credit.external ? (
    <a href={credit.href} target="_blank" rel="noopener noreferrer" className={className}>{artist}</a>
  ) : <SmartLink href={credit.href} className={className}>{artist}</SmartLink>;
}

async function CommentaryCredit({ attribution }: { attribution: NonNullable<EffectArticleRichSectionModel["attribution"]> }) {
  return <EffectCommentaryAttribution attribution={attribution} contributorDirectory={await getPublicContributorDirectory()} />;
}

async function Contributors({ contributors }: { contributors: string[] }) {
  return <div id="contributors" className="scroll-mt-24"><EffectContributorsSection contributors={contributors} contributorDirectory={await getPublicContributorDirectory()} t={t} /></div>;
}

async function RelatedSubstances({ effectSlug, drugHrefPrefix, categoryHrefPrefix, linkableSubstanceSlugs }: {
  effectSlug: string;
} & Pick<ComponentProps<typeof EffectArticlePage>, "drugHrefPrefix" | "categoryHrefPrefix" | "linkableSubstanceSlugs">) {
  const detail = await getPublicEffectDetail(effectSlug);
  if (!detail?.groups.length) return null;
  return (
    <ArticleSection id="related-substances" icon="lucide:flask-conical" heading={t("Related Substances")} spacing="effect">
      <div className="mt-6"><RelatedSubstancesSection groups={detail.groups} total={detail.definition.total} drugHrefPrefix={drugHrefPrefix} categoryHrefPrefix={categoryHrefPrefix} linkableSubstanceSlugs={linkableSubstanceSlugs} showHeading={false} t={t} /></div>
    </ArticleSection>
  );
}

function Toc({ article, strip = false }: { article: EffectArticleModel; strip?: boolean }) {
  const items = getEffectArticleTocItems(article).map(item => ({ ...item, label: t(item.label) }));
  if (items.length < 2) return null;
  return strip ? <PublicTocStrip items={items} /> : <PublicTableOfContents items={items} variant="bare" />;
}

async function ResolvedToc({ article, effectSlug, strip }: { article: EffectArticleModel; effectSlug: string; strip?: boolean }) {
  const detail = await getPublicEffectDetail(effectSlug);
  return <Toc article={detail?.groups.length ? article : { ...article, sections: article.sections.filter(section => section.kind !== "relatedSubstances") }} strip={strip} />;
}

/** Public prose is server-rendered; only independent secondary fragments suspend. */
export function EffectArticleServer({ effectSlug, ...props }: ComponentProps<typeof EffectArticlePage> & { effectSlug: string }) {
  const sections = [...props.article.sections];
  const relatedIndex = sections.findIndex(section => section.kind === "sources" || section.kind === "contributors");
  sections.splice(relatedIndex < 0 ? sections.length : relatedIndex, 0, {
    kind: "relatedSubstances", id: "related-substances", title: "Related Substances", icon: "lucide:flask-conical", groups: [], total: 0,
  });
  const article = { ...props.article, sections };
  const commentary = sections.find((section): section is EffectArticleRichSectionModel => section.kind === "personalCommentary");
  const contributors = sections.find(section => section.kind === "contributors");
  return (
    <EffectArticlePage
      {...props}
      article={article}
      t={t}
      toc={<Suspense fallback={<Toc article={props.article} />}><ResolvedToc article={article} effectSlug={effectSlug} /></Suspense>}
      tocStrip={<Suspense fallback={<Toc article={props.article} strip />}><ResolvedToc article={article} effectSlug={effectSlug} strip /></Suspense>}
      sectionOverrides={{
        relatedSubstances: <Suspense fallback={null}><RelatedSubstances effectSlug={effectSlug} drugHrefPrefix={props.drugHrefPrefix} categoryHrefPrefix={props.categoryHrefPrefix} linkableSubstanceSlugs={props.linkableSubstanceSlugs} /></Suspense>,
        ...(contributors ? { contributors: <Suspense fallback={<div id="contributors" className="scroll-mt-24"><EffectContributorsSection contributors={contributors.contributors} t={t} /></div>}><Contributors contributors={contributors.contributors} /></Suspense> } : {}),
      }}
      commentaryAttribution={commentary?.attribution ? <Suspense fallback={<EffectCommentaryAttribution attribution={commentary.attribution} />}><CommentaryCredit attribution={commentary.attribution} /></Suspense> : undefined}
      renderArtistCredit={artist => <Suspense fallback={artist}><ArtistCredit artist={artist} /></Suspense>}
    />
  );
}
