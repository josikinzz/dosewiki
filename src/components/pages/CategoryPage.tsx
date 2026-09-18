import { SmartLink } from "@/components/common/SmartLink";
import { PageHeader } from "@/components/layout/PageHeader";
import { ArticleSection } from "@/components/common/ArticleSection";
import { Icon } from "@/components/common/Icon";
import { IndexCard, IndexCardList, IndexCardListItem } from "@/components/common/IndexCard";
import {
  IndexPanelMasonry,
  INDEX_PANEL_MASONRY_ITEM_CLASS_NAME,
} from "@/components/common/IndexPanelLayout";
import { PublicTableOfContents } from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { PublicSectionHeading } from "@/components/layout/PublicPagePrimitives";
import { CategoryGrid } from "@/features/article/components/sections/CategoryGrid";
import { VCodeRenderer } from "@/features/effects/vcode/VCodeRenderer";
import { normalizeVCodeContent } from "@/features/effects/vcode/normalize";
import type { ArtistCreditLinks } from "@/features/effects/vcode/artistCreditLinks";
import type {
  CategoryDetail,
  DosageCategoryGroup,
} from "../../data/builders/library";
import {
  getDrugClassContent,
  type DrugClassContent,
  type DrugClassSection,
} from "@/data/drugClassContent";
import {
  buildCategoryTocItems,
  categorySectionAnchorId,
  resolveDrugClassSections,
  CATEGORY_OVERVIEW_ANCHOR_ID,
  CATEGORY_SUBSTANCES_ANCHOR_ID,
  INITIAL_DRUG_CLASS_SECTION_LIMIT,
  type CategoryEffect,
  type CategorySectionWithEffects,
} from "./categoryPageContents";
import { publicHref } from "@/utils/publicHref";
import { slugify } from "@/utils/slug";
import { icons } from "@/utils/iconNames";
import { t } from "@/i18n/server";

interface CategoryPageProps {
  detail: CategoryDetail;
  effects?: CategoryEffect[];
  drugHrefPrefix?: string;
  artistCreditLinks?: ArtistCreditLinks;
}

const BODY_COPY_CLASS = "theme-text-muted type-supporting-copy type-reading-measure";
const ASIDE_COPY_CLASS = "theme-text-faint type-detail-copy type-reading-measure italic";

function localizeParagraphHtml(value: string): string {
  return value.replace(
    /<p>(.*?)<\/p>/gs,
    (_match, paragraph: string) => `<p>${t(paragraph)}</p>`,
  );
}

/**
 * Single effect with its long summary rendered inline.
 *
 * The effect title links to the full article. Uses long_summary for VCode
 * content; falls back to plain summary text - never the full description.
 */
function EffectLongSummary({
  effect,
  artistCreditLinks,
}: {
  effect: CategoryEffect;
  artistCreditLinks?: ArtistCreditLinks;
}) {
  const longSummaryContent = normalizeVCodeContent(
    effect.long_summary_ast,
    effect.long_summary_raw,
  );

  return (
    <article
      id={effect.slug}
      className="scroll-mt-24 border-b border-dose-divider pb-8 last:border-b-0 last:pb-0"
    >
      <h3 className="text-xl font-semibold tracking-tight">
        <SmartLink
          href={publicHref.effect(effect.slug)}
          className="group/effect theme-accent-heading theme-focus-ring inline-flex items-center gap-2 transition-opacity hover:opacity-85"
        >
          <span className="min-w-0 break-words">{effect.name}</span>
          <Icon
            icon="lucide:arrow-right"
            className="h-4 w-4 shrink-0 -translate-x-1 opacity-0 transition-[opacity,translate] duration-200 group-hover/effect:translate-x-0 group-hover/effect:opacity-70"
          />
        </SmartLink>
      </h3>

      {longSummaryContent ? (
        <div className="theme-text-secondary prose prose-fuchsia type-reading-measure mt-3">
          <VCodeRenderer
            content={longSummaryContent}
            citations={effect.citations}
            subarticles={effect.subarticles}
            artistCreditLinks={artistCreditLinks}
          />
        </div>
      ) : (
        <p className={`${BODY_COPY_CLASS} mt-3`}>{effect.summary}</p>
      )}
    </article>
  );
}

/**
 * Full-summary section rendered as free-floating article prose,
 * matching the formatting of individual effect articles.
 */
function EffectSection({
  section,
  effects,
  artistCreditLinks,
}: {
  section: DrugClassSection;
  effects: CategoryEffect[];
  artistCreditLinks?: ArtistCreditLinks;
}) {
  if (effects.length === 0) {
    return null;
  }

  return (
    <ArticleSection
      id={categorySectionAnchorId(section)}
      icon={section.icon}
      heading={t(section.title)}
      spacing="effect"
    >
      <p className={BODY_COPY_CLASS}>{t(section.description)}</p>
      <div className="space-y-8">
        {effects.map((effect) => (
          <EffectLongSummary
            key={effect._id ?? effect.slug}
            effect={effect}
            artistCreditLinks={artistCreditLinks}
          />
        ))}
      </div>
    </ArticleSection>
  );
}

/**
 * Compact panel for a link-preview section: definition at the top,
 * effect links below, rendered in the same panel style as the indexes.
 */
function EffectSectionPanel({
  section,
  effects,
}: {
  section: DrugClassSection;
  effects: CategoryEffect[];
}) {
  return (
    <div
      id={categorySectionAnchorId(section)}
      className={`${INDEX_PANEL_MASONRY_ITEM_CLASS_NAME} scroll-mt-24`}
    >
      <IndexCard
        title={t(section.title)}
        icon={section.icon}
        count={effects.length}
        description={t(section.description)}
      >
        <div className="pt-1">
          <IndexCardList>
            {effects.map((effect) => (
              <IndexCardListItem
                key={effect._id ?? effect.slug}
                id={effect.slug}
                label={effect.name}
                href={publicHref.effect(effect.slug)}
                slug={effect.slug}
              />
            ))}
          </IndexCardList>
        </div>
      </IndexCard>
    </div>
  );
}

/**
 * Drug class article for hallucinogen categories.
 * Free-floating prose for the core sections, index-style panels for the rest.
 */
function DrugClassArticleSection({
  content,
  sections,
  artistCreditLinks,
}: {
  content: DrugClassContent;
  sections: CategorySectionWithEffects[];
  artistCreditLinks?: ArtistCreditLinks;
}) {
  const fullSummarySections = sections.slice(0, INITIAL_DRUG_CLASS_SECTION_LIMIT);
  const linkPreviewSections = sections.slice(INITIAL_DRUG_CLASS_SECTION_LIMIT);

  return (
    <>
      {/* Intro: free-floating prose, no card */}
      <section
        id={CATEGORY_OVERVIEW_ANCHOR_ID}
        className="scroll-mt-24 space-y-4"
      >
        <PublicSectionHeading
          icon={icons.subjectiveEffectIndex}
          title={t(content.title)}
          titleElement="h2"
        />
        <div
          className="theme-text-secondary prose prose-fuchsia type-lead type-reading-measure"
          dangerouslySetInnerHTML={{ __html: localizeParagraphHtml(content.introHtml) }}
        />
        <p className={ASIDE_COPY_CLASS}>{t(content.applicableSubstances)}</p>
        <p className={ASIDE_COPY_CLASS}>
          {t(
            "The article begins with simpler effects and works up toward more complex experiences. Each effect links to its full article.",
          )}
        </p>
      </section>

      {fullSummarySections.map(({ section, effects: sectionEffects }) => (
        <EffectSection
          key={section.title}
          section={section}
          effects={sectionEffects}
          artistCreditLinks={artistCreditLinks}
        />
      ))}

      {linkPreviewSections.length > 0 && (
        <section className="space-y-6 pt-6">
          <PublicSectionHeading
            icon={icons.subjectiveEffectIndex}
            title={t("Further Effects")}
          />
          <p className={BODY_COPY_CLASS}>
            {t(
              "The remaining effect categories are summarized below. Open any effect for its full article, replications, and analysis.",
            )}
          </p>
          <IndexPanelMasonry>
            {linkPreviewSections.map(({ section, effects: sectionEffects }) => (
              <EffectSectionPanel
                key={section.title}
                section={section}
                effects={sectionEffects}
              />
            ))}
          </IndexPanelMasonry>
        </section>
      )}
    </>
  );
}

export function CategoryPage({
  detail,
  effects = [],
  drugHrefPrefix,
  artistCreditLinks,
}: CategoryPageProps) {
  const drugClassContent = getDrugClassContent(detail.definition.key);
  const sectionsWithEffects = resolveDrugClassSections(drugClassContent, effects);
  const tocItems = buildCategoryTocItems({
    sections: sectionsWithEffects,
    hasOverview: Boolean(drugClassContent),
    substanceCount: detail.total,
    substanceIcon: detail.definition.icon,
  }).map((item) => ({
    ...item,
    label:
      item.id === CATEGORY_SUBSTANCES_ANCHOR_ID
        ? `${t("Substances")} (${detail.total})`
        : t(item.label),
  }));
  // A lone "Substances" entry is navigation without a destination, so plain
  // categories keep the single-column layout instead of gaining an empty rail.
  const hasTableOfContents = tocItems.length > 1;
  const substanceGroups: DosageCategoryGroup[] = detail.groups.map((group) => ({
    key: slugify(group.name),
    name: group.name,
    icon: detail.definition.icon,
    total: group.drugs.length,
    drugs: group.drugs,
  }));

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="theme-page-shell min-h-screen focus:outline-none"
    >
      <StickyTocLayout
        toc={
          hasTableOfContents ? (
            <PublicTableOfContents items={tocItems} variant="bare" />
          ) : null
        }
        maxWidthClass={hasTableOfContents ? "max-w-4xl" : "max-w-6xl"}
        contentClassName="gap-10 text-left"
        className={hasTableOfContents ? "theme-toc-strip-scope" : undefined}
      >
        {/* Subsections give the page a contents rail, which turns it into an
            article rather than a landing page. A centred title beside that rail
            shares an edge with nothing; left-aligned it lines up with the rail
            and with every heading below it. */}
        {/* Mobile/tablet TOC: sticky chip strip above the title, pinned under
            the site header from the very first scroll; replaced by the sticky
            gutter TOC at >=1200px. */}
        {hasTableOfContents && <PublicTocStrip items={tocItems} />}

        <PageHeader
          title={t(detail.definition.name)}
          icon={detail.definition.icon}
          align={hasTableOfContents ? "left" : "center"}
        />

        {/* Drug class article for hallucinogen categories */}
        {drugClassContent && (
          <DrugClassArticleSection
            content={drugClassContent}
            sections={sectionsWithEffects}
            artistCreditLinks={artistCreditLinks}
          />
        )}

        {/* Substance list by group, in the same panel grid as the index */}
        <section
          id={CATEGORY_SUBSTANCES_ANCHOR_ID}
          className="scroll-mt-24 space-y-8 pt-6"
        >
          {drugClassContent && (
            <PublicSectionHeading
              icon={detail.definition.icon}
              title={`${t(detail.definition.name)} ${t("Substances")}`}
            />
          )}
          {substanceGroups.length > 0 ? (
            <CategoryGrid
              groups={substanceGroups}
              drugHrefPrefix={drugHrefPrefix ?? "/"}
              maxColumns={hasTableOfContents ? 2 : 3}
            />
          ) : (
            <p className={BODY_COPY_CLASS}>
              {t("No compounds are currently mapped to this category.")}
            </p>
          )}
        </section>
      </StickyTocLayout>
    </main>
  );
}
