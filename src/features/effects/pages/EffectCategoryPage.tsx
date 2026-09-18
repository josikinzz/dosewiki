import Link from "next/link";
import { t } from "@/i18n/server";
import { Icon, type IconName } from "@/components/common/Icon";
import {
  IndexCard,
  IndexCardList,
  IndexCardListItem,
} from "@/components/common/IndexCard";
import { PublicNameChip } from "@/components/common/PublicTokens";
import {
  PublicTableOfContents,
  type PublicTableOfContentsItem,
} from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";
import { StateCard } from "@/components/common/StateCard";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { Button } from "@/components/ui/button";
import { getEffectCategoryDefinition } from "@/data/effectCategoryDefinitions";
import { GuideLinkLine } from "@/features/articles/components/GuideLinkLine";
import { ARTICLE_GUIDES_BY_CLASS } from "@/features/articles/domain/articleGuides";
import { publicHref } from "@/utils/publicHref";
import { buildEffectCategoryGroups } from "./effectCategoryGroups";
import { resolveEffectCategoryIcon } from "./effectsIndexConfig";

/**
 * Minimal effect type for category display.
 */
interface EffectSummary {
  slug: string;
  name: string;
  tags: string[];
  summary?: string;
}

interface EffectCategoryPageProps {
  categorySlug: string;
  effects: EffectSummary[];
  effectHrefPrefix?: string;
  backHref?: string;
  /** Editable category descriptions by slug, resolved from the copy blocks. */
  descriptions?: Record<string, string>;
}

const FLAT_SECTION_ID = "effects";

const PROSE_CLASS =
  "type-supporting-copy type-reading-measure theme-text-secondary";

function titleFromSlug(categorySlug: string): string {
  return categorySlug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function toParagraphs(description: string): string[] {
  return description
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/**
 * Effect category page.
 *
 * Top-level categories present their subcategories as columned panels, each
 * linking to that subcategory's own page. Subcategories and other leaf
 * categories open with their definition and then list their effects.
 */
export function EffectCategoryPage({
  categorySlug,
  effects,
  effectHrefPrefix,
  backHref,
  descriptions,
}: EffectCategoryPageProps) {
  const definition = getEffectCategoryDefinition(categorySlug);
  const title = t(definition?.name ?? titleFromSlug(categorySlug));
  const icon: IconName =
    resolveEffectCategoryIcon(categorySlug) ?? definition?.icon ?? "lucide:tag";
  // Editable copy wins; the checked-in definition is the fallback, and the copy
  // defaults hold that same prose, so an un-seeded read is a no-op.
  const paragraphs = toParagraphs(t(
    descriptions?.[categorySlug] ??
      definition?.description ??
      `Effects tagged with "${categorySlug}".`,
  ));

  const filteredEffects = effects;

  const groups = buildEffectCategoryGroups({
    categorySlug,
    effects: filteredEffects,
    descriptions,
  }).map((group) => ({
    ...group,
    title: t(group.title),
    description: group.description ? t(group.description) : undefined,
  }));

  const tocItems: PublicTableOfContentsItem[] = groups.map((group) => ({
    id: group.id,
    label: group.title,
    icon: group.icon,
  }));

  const effectHref = (slug: string) =>
    effectHrefPrefix ? `${effectHrefPrefix}${slug}` : publicHref.effect(slug);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="theme-page-shell min-h-screen focus:outline-none"
    >
      <StickyTocLayout
        toc={
          tocItems.length > 0 ? (
            <PublicTableOfContents items={tocItems} variant="bare" />
          ) : null
        }
        maxWidthClass="max-w-4xl"
        contentClassName="gap-8"
        className={tocItems.length > 0 ? "theme-toc-strip-scope" : undefined}
      >
        {/* Mobile/tablet TOC: sticky chip strip above the header, pinned under
            the site header from the very first scroll; replaced by the sticky
            gutter TOC at >=1200px. */}
        {tocItems.length > 0 ? <PublicTocStrip items={tocItems} /> : null}

        <div>
          <Button variant="ghostPill" size="pill" asChild>
            <Link href={backHref ?? publicHref.effects()}>
              <Icon icon="lucide:arrow-left" size={16} />
              {t("Back to Effects Index")}
            </Link>
          </Button>
        </div>

        <header className="flex flex-col gap-4 border-b border-dose-divider pb-8">
          <p className="type-kicker theme-text-faint">{t("Effect category")}</p>
          <h1 className="type-page-title theme-accent-heading flex flex-wrap items-center gap-x-4 gap-y-2">
            <Icon
              icon={icon}
              size="1.05em"
              className="theme-accent-heading shrink-0"
            />
            <span className="min-w-0">{title}</span>
          </h1>
          <div className={`${PROSE_CLASS} flex flex-col gap-4`}>
            {paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          {/* The disconnective family is what the dissociative intensity scale
              grades, so the category page offers the scale beside its own
              definition rather than leaving the reader to find it. */}
          {categorySlug === "disconnective-effects" ? (
            <GuideLinkLine scale={ARTICLE_GUIDES_BY_CLASS.dissociative.scale} />
          ) : null}
          <p className="type-detail-copy theme-text-faint">
            {groups.length > 0
              ? t("{{effects}} effects across {{groups}} groups", {
                  effects: filteredEffects.length,
                  groups: groups.length,
                })
              : t(filteredEffects.length === 1 ? "{{count}} effect" : "{{count}} effects", {
                  count: filteredEffects.length,
                })}
          </p>
        </header>

        {filteredEffects.length === 0 ? (
          <StateCard
            badge="No matches"
            badgeVariant="secondary"
            title={t("No effects match this category")}
            description={t("This category exists, but there are no imported effects mapped to it yet.")}
            icon="lucide:search-x"
            tone="neutral"
            compact
          />
        ) : groups.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:gap-6">
            {groups.map((group) => (
              <div key={group.id} id={group.id} className="scroll-mt-24">
                <IndexCard
                  title={group.title}
                  icon={group.icon}
                  count={group.effects.length}
                  titleHref={
                    group.categorySlug
                      ? publicHref.effectCategory(group.categorySlug)
                      : undefined
                  }
                  description={
                    group.description ? (
                      <span className="line-clamp-3 block">
                        {group.description}
                      </span>
                    ) : undefined
                  }
                >
                  <IndexCardList>
                    {group.effects.map((effect) => (
                      <IndexCardListItem
                        key={effect.slug}
                        label={effect.name}
                        href={effectHref(effect.slug)}
                      />
                    ))}
                  </IndexCardList>
                </IndexCard>
              </div>
            ))}
          </div>
        ) : (
          /* A leaf category is one list. It carried a card whose header
             repeated the page's own icon, title, and effect count directly
             under the header that had just said all three; with that removed
             the card was an empty box around a chip cloud, so both are gone
             and the chips sit in the page. */
          <section
            id={FLAT_SECTION_ID}
            className="flex flex-wrap gap-2.5 scroll-mt-24"
          >
            {filteredEffects.map((effect) => (
              <PublicNameChip
                key={effect.slug}
                as={Link}
                href={effectHref(effect.slug)}
                interactive
              >
                {effect.name}
              </PublicNameChip>
            ))}
          </section>
        )}
      </StickyTocLayout>
    </main>
  );
}
