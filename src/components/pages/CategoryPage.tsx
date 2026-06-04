import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import {
  PublicContentShell,
  PublicSectionHeading,
  TaxonomyGroupSection,
  type TaxonomyGroup,
} from "@/components/layout/PublicPagePrimitives";
import { VCodeRenderer } from "@/features/effects/vcode/VCodeRenderer";
import { normalizeVCodeContent } from "@/features/effects/vcode/normalize";
import type { CategoryDetail } from "../../data/builders/library";
import {
  getDrugClassContent,
  type DrugClassSection,
} from "@/data/drugClassContent";
import { publicHref } from "@/utils/publicHref";

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

function getSectionDescription(section: DrugClassSection) {
  return section.description.replace(/^[A-Za-z\s]+ are /, "are ");
}

/**
 * Single effect with its long summary rendered inline.
 *
 * Uses long_summary for VCode content on category pages.
 * Falls back to plain summary text - never shows full description here.
 */
function EffectLongSummary({ effect }: { effect: SubjectiveEffect }) {
  // Only use long_summary for VCode content - never show full description on category pages
  const longSummaryContent = normalizeVCodeContent(
    effect.long_summary_ast,
    effect.long_summary_raw,
  );

  return (
    <div className="mb-8 pb-6 last:mb-0 last:pb-0 relative after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-white/10 after:to-transparent last:after:hidden">
      {/* Effect title */}
      <h4
        id={effect.slug}
        className="theme-text-primary text-lg font-semibold mb-1"
      >
        {effect.name}
      </h4>

      {/* Full article link */}
      <p className="theme-text-faint text-sm italic mb-4">
        Full article:{" "}
        <Link
          href={publicHref.effect(effect.slug)}
          className="theme-accent-heading cursor-pointer underline underline-offset-2 transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
        >
          {effect.name}
        </Link>
      </p>

      {/* Long summary content OR plain summary fallback */}
      {longSummaryContent ? (
        <div className="theme-text-secondary prose prose-invert prose-sm max-w-none">
          <VCodeRenderer
            content={longSummaryContent}
            citations={effect.citations}
            subarticles={effect.subarticles}
          />
        </div>
      ) : (
        <p className="theme-text-muted text-sm leading-relaxed">
          {effect.summary}
        </p>
      )}
    </div>
  );
}

/**
 * Section with its effects rendered inline (Wikipedia-style).
 */
function EffectSection({
  section,
  effects,
  delay,
}: {
  section: DrugClassSection;
  effects: SubjectiveEffect[];
  delay: number;
}) {
  // Don't render sections with no matching effects
  if (effects.length === 0) {
    return null;
  }

  return (
    <SectionCard delay={delay}>
      {/* Section header */}
      <PublicSectionHeading
        variant="card"
        icon={section.icon}
        title={section.title}
        className="mb-4"
      />

      {/* Section description */}
      <p className="theme-text-muted text-sm leading-relaxed mb-6 pb-4 relative after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-white/10 after:to-transparent">
        <b className="theme-text-secondary">{section.title}</b>{" "}
        {getSectionDescription(section)}
      </p>

      {/* Effects with long summaries */}
      {effects.map((effect) => (
        <EffectLongSummary key={effect._id ?? effect.slug} effect={effect} />
      ))}
    </SectionCard>
  );
}

function EffectSectionLinkPreview({
  section,
  effects,
  delay,
}: {
  section: DrugClassSection;
  effects: SubjectiveEffect[];
  delay: number;
}) {
  if (effects.length === 0) {
    return null;
  }

  return (
    <SectionCard delay={delay}>
      <PublicSectionHeading
        variant="card"
        icon={section.icon}
        title={section.title}
        className="mb-4"
      />

      <p className="theme-text-muted text-sm leading-relaxed mb-5">
        <b className="theme-text-secondary">{section.title}</b>{" "}
        {getSectionDescription(section)}
      </p>

      <ul className="theme-text-secondary grid gap-x-5 gap-y-1 text-sm sm:grid-cols-2">
        {effects.map((effect) => (
          <li key={effect._id ?? effect.slug} id={effect.slug}>
            <Link
              href={publicHref.effect(effect.slug)}
              className="group/link flex min-h-10 items-center border-b border-dose-divider px-1 py-2 transition-colors hover:border-dose-accent hover:text-dose-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
            >
              <span className="theme-taxonomy-link-label min-w-0 break-words transition-colors group-hover/link:text-dose-accent-soft">
                {effect.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/**
 * Drug class article section for hallucinogen categories.
 * Renders a Wikipedia-style article with inline effect summaries.
 */
function DrugClassArticleSection({
  categoryKey,
  effects,
}: {
  categoryKey: string;
  effects: SubjectiveEffect[];
}) {
  const content = getDrugClassContent(categoryKey);

  if (!content) return null;

  const sectionsWithEffects = (content.sections ?? [])
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
      {/* Main intro card */}
      <SectionCard delay={0.02}>
        <PublicSectionHeading
          variant="card"
          icon="lucide:sparkles"
          title={content.title}
          titleElement="h2"
          className="mb-4"
        />

        {/* Intro paragraphs */}
        <div
          className="theme-text-secondary prose prose-invert prose-sm max-w-none [&>p]:mb-3 [&>p:last-child]:mb-0"
          dangerouslySetInnerHTML={{ __html: content.introHtml }}
        />

        {/* Applicable substances */}
        <p className="theme-text-faint mt-4 text-sm italic">
          {content.applicableSubstances}
        </p>

        {/* Article navigation note */}
        <p className="theme-text-muted mt-4 text-sm">
          The article begins with a description of the simpler effects and works
          its way up towards more complex experiences as it progresses.
          Individual effects are also summarized with a link to their full
          article.
        </p>
      </SectionCard>

      {/* Effect sections with inline long summaries */}
      {sectionsWithEffects.length > 0 && (
        <>
          {fullSummarySections.map(({ section, effects: sectionEffects }, idx) => (
            <EffectSection
              key={section.title}
              section={section}
              effects={sectionEffects}
              delay={0.04 + idx * 0.02}
            />
          ))}
          {linkPreviewSections.map(({ section, effects: sectionEffects }, idx) => (
            <EffectSectionLinkPreview
              key={section.title}
              section={section}
              effects={sectionEffects}
              delay={
                0.04 + (fullSummarySections.length + idx) * 0.02
              }
            />
          ))}
        </>
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
  const taxonomyGroups: TaxonomyGroup[] = detail.groups.map((group) => ({
    id: group.name,
    title: group.name,
    items: group.drugs.map((drug) => ({
      id: drug.slug,
      label: drug.name,
      href: drugHrefPrefix
        ? `${drugHrefPrefix}${drug.slug}`
        : publicHref.substance(drug.slug),
    })),
  }));

  return (
    <PublicContentShell focusTarget>
      <PageHeader
        title={detail.definition.name}
        icon={detail.definition.icon}
        description={`${detail.total} substance${detail.total === 1 ? "" : "s"} tagged in this category.`}
      />
      <div className="space-y-6">
        {/* Drug class article section for hallucinogen categories */}
        {hasDrugClassContent && (
          <DrugClassArticleSection
            categoryKey={detail.definition.key}
            effects={resolvedEffects}
          />
        )}

        {/* Substance list by group */}
        <TaxonomyGroupSection
          icon={detail.definition.icon}
          label={detail.definition.name}
          groups={taxonomyGroups}
          emptyText="No compounds are currently mapped to this category."
        />
      </div>
    </PublicContentShell>
  );
}
