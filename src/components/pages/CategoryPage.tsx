import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { ArticleSection } from "@/components/common/ArticleSection";
import { Icon } from "@/components/common/Icon";
import { IndexCard, IndexCardList, IndexCardListItem } from "@/components/common/IndexCard";
import {
  IndexPanelMasonry,
  INDEX_PANEL_MASONRY_ITEM_CLASS_NAME,
} from "@/components/common/IndexPanelLayout";
import {
  PublicContentShell,
  PublicSectionHeading,
} from "@/components/layout/PublicPagePrimitives";
import { CategoryGrid } from "@/features/article/components/sections/CategoryGrid";
import { VCodeRenderer } from "@/features/effects/vcode/VCodeRenderer";
import { normalizeVCodeContent } from "@/features/effects/vcode/normalize";
import type {
  CategoryDetail,
  DosageCategoryGroup,
} from "../../data/builders/library";
import {
  getDrugClassContent,
  type DrugClassSection,
} from "@/data/drugClassContent";
import { publicHref } from "@/utils/publicHref";
import { slugify } from "@/utils/slug";
import { icons } from "@/utils/iconNames";

type SubjectiveEffect = {
  _id?: string;
  slug: string;
  name: string;
  tags: string[];
  summary: string;
  long_summary_raw?: string;
  long_summary_ast?: unknown;
  citations?: Array<{ url: string; text: string; from?: string }>;
  subarticles?: Array<{ id: string; title: string }>;
};

interface CategoryPageProps {
  detail: CategoryDetail;
  effects?: SubjectiveEffect[];
  drugHrefPrefix?: string;
}

const INITIAL_DRUG_CLASS_SECTION_LIMIT = 4;
const SUBSTANCES_ANCHOR_ID = "substances";

/**
 * Filter effects by tags (all must match) with optional exclusions.
 */
function filterEffectsByTags(
  effects: SubjectiveEffect[],
  requiredTags: string[],
  excludeTags?: string[],
): SubjectiveEffect[] {
  return effects.filter((effect) => {
    // All required tags must be present
    const hasAllRequired = requiredTags.every((tag) =>
      effect.tags.some((t) => t.toLowerCase() === tag.toLowerCase()),
    );
    if (!hasAllRequired) return false;

    // No excluded tags should be present
    if (excludeTags && excludeTags.length > 0) {
      const hasExcluded = excludeTags.some((tag) =>
        effect.tags.some((t) => t.toLowerCase() === tag.toLowerCase()),
      );
      if (hasExcluded) return false;
    }

    return true;
  });
}

function sectionAnchorId(section: DrugClassSection) {
  return slugify(section.title);
}

interface SectionWithEffects {
  section: DrugClassSection;
  effects: SubjectiveEffect[];
}

/**
 * Numbered jump navigation for the drug class article.
 * Encodes the simple-to-complex progression of the sections.
 */
function ContentsNav({
  sections,
  substanceCount,
}: {
  sections: SectionWithEffects[];
  substanceCount: number;
}) {
  const pillClassName =
    "theme-public-card-subtle inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors hover:border-dose-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400";

  return (
    <nav aria-label="On this page" className="flex flex-wrap items-center gap-2">
      {sections.map(({ section }, index) => (
        <a
          key={section.title}
          href={`#${sectionAnchorId(section)}`}
          className={pillClassName}
        >
          <span className="theme-text-faint text-xs font-semibold tabular-nums">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="theme-text-secondary">{section.title}</span>
        </a>
      ))}
      <a href={`#${SUBSTANCES_ANCHOR_ID}`} className={pillClassName}>
        <span className="theme-text-faint text-xs font-semibold tabular-nums">
          {String(sections.length + 1).padStart(2, "0")}
        </span>
        <span className="theme-text-secondary">
          Substances ({substanceCount})
        </span>
      </a>
    </nav>
  );
}

/**
 * Single effect with its long summary rendered inline.
 *
 * The effect title links to the full article. Uses long_summary for VCode
 * content; falls back to plain summary text - never the full description.
 */
function EffectLongSummary({ effect }: { effect: SubjectiveEffect }) {
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
        <Link
          href={publicHref.effect(effect.slug)}
          className="group/effect theme-accent-heading inline-flex items-center gap-2 transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
        >
          <span className="min-w-0 break-words">{effect.name}</span>
          <Icon
            icon="lucide:arrow-right"
            className="h-4 w-4 shrink-0 -translate-x-1 opacity-0 transition-[opacity,translate] duration-200 group-hover/effect:translate-x-0 group-hover/effect:opacity-70"
          />
        </Link>
      </h3>

      {longSummaryContent ? (
        <div className="theme-text-secondary prose prose-invert prose-fuchsia prose-a:font-normal mt-3 max-w-none">
          <VCodeRenderer
            content={longSummaryContent}
            citations={effect.citations}
            subarticles={effect.subarticles}
          />
        </div>
      ) : (
        <p className="theme-text-muted mt-3 text-sm leading-relaxed">
          {effect.summary}
        </p>
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
}: {
  section: DrugClassSection;
  effects: SubjectiveEffect[];
}) {
  if (effects.length === 0) {
    return null;
  }

  return (
    <ArticleSection
      id={sectionAnchorId(section)}
      icon={section.icon}
      heading={section.title}
      spacing="effect"
    >
      <p className="theme-text-muted max-w-[72ch] text-[0.9375rem] leading-relaxed">
        {section.description}
      </p>
      <div className="space-y-8">
        {effects.map((effect) => (
          <EffectLongSummary key={effect._id ?? effect.slug} effect={effect} />
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
  effects: SubjectiveEffect[];
}) {
  return (
    <div
      id={sectionAnchorId(section)}
      className={`${INDEX_PANEL_MASONRY_ITEM_CLASS_NAME} scroll-mt-24`}
    >
      <IndexCard
        title={section.title}
        icon={section.icon}
        count={effects.length}
        description={section.description}
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
  categoryKey,
  effects,
  substanceCount,
}: {
  categoryKey: string;
  effects: SubjectiveEffect[];
  substanceCount: number;
}) {
  const content = getDrugClassContent(categoryKey);

  if (!content) return null;

  const sectionsWithEffects: SectionWithEffects[] = (content.sections ?? [])
    .map((section) => ({
      section,
      effects: filterEffectsByTags(
        effects,
        section.effectTags,
        section.excludeTags,
      ),
    }))
    .filter(({ effects: matchingEffects }) => matchingEffects.length > 0);
  const fullSummarySections = sectionsWithEffects.slice(
    0,
    INITIAL_DRUG_CLASS_SECTION_LIMIT,
  );
  const linkPreviewSections = sectionsWithEffects.slice(
    INITIAL_DRUG_CLASS_SECTION_LIMIT,
  );

  return (
    <>
      {/* Intro: free-floating prose, no card */}
      <section className="space-y-4">
        <PublicSectionHeading
          icon={icons.subjectiveEffectIndex}
          title={content.title}
          titleElement="h2"
        />
        <div
          className="theme-text-secondary prose prose-invert prose-fuchsia prose-a:font-normal max-w-none text-[1.0625rem] leading-7"
          dangerouslySetInnerHTML={{ __html: content.introHtml }}
        />
        <p className="theme-text-faint text-sm italic leading-relaxed">
          {content.applicableSubstances}
        </p>
        <p className="theme-text-faint text-sm italic">
          The article begins with simpler effects and works up toward more
          complex experiences. Each effect links to its full article.
        </p>
      </section>

      {sectionsWithEffects.length > 0 && (
        <ContentsNav
          sections={sectionsWithEffects}
          substanceCount={substanceCount}
        />
      )}

      {fullSummarySections.map(({ section, effects: sectionEffects }) => (
        <EffectSection
          key={section.title}
          section={section}
          effects={sectionEffects}
        />
      ))}

      {linkPreviewSections.length > 0 && (
        <section className="space-y-6 pt-6">
          <PublicSectionHeading
            icon={icons.subjectiveEffectIndex}
            title="Further Effects"
          />
          <p className="theme-text-muted max-w-[72ch] text-[0.9375rem] leading-relaxed">
            The remaining effect categories are summarized below. Open any
            effect for its full article, replications, and analysis.
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
}: CategoryPageProps) {
  // Check if this category has drug class content
  const hasDrugClassContent =
    getDrugClassContent(detail.definition.key) !== undefined;
  const resolvedEffects = hasDrugClassContent ? effects : [];
  const substanceGroups: DosageCategoryGroup[] = detail.groups.map((group) => ({
    key: slugify(group.name),
    name: group.name,
    icon: detail.definition.icon,
    total: group.drugs.length,
    drugs: group.drugs,
  }));

  return (
    <PublicContentShell width="wide" focusTarget>
      <div className="mx-auto max-w-4xl space-y-10">
        <PageHeader
          title={detail.definition.name}
          icon={detail.definition.icon}
        />

        {/* Drug class article for hallucinogen categories */}
        {hasDrugClassContent && (
          <DrugClassArticleSection
            categoryKey={detail.definition.key}
            effects={resolvedEffects}
            substanceCount={detail.total}
          />
        )}
      </div>

      {/* Substance list by group, in the same panel grid as the index */}
      <section
        id={SUBSTANCES_ANCHOR_ID}
        className="scroll-mt-24 space-y-8 pt-12"
      >
        {hasDrugClassContent && (
          <div className="mx-auto max-w-4xl">
            <PublicSectionHeading
              icon={detail.definition.icon}
              title={`${detail.definition.name} Substances`}
            />
          </div>
        )}
        {substanceGroups.length > 0 ? (
          <CategoryGrid
            groups={substanceGroups}
            drugHrefPrefix={drugHrefPrefix ?? "/"}
            maxColumns={3}
          />
        ) : (
          <p className="theme-text-muted mx-auto max-w-4xl text-sm">
            No compounds are currently mapped to this category.
          </p>
        )}
      </section>
    </PublicContentShell>
  );
}
