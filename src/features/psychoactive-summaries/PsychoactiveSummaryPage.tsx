import { SmartLink } from "@/components/common/SmartLink";

import { ArticleSection } from "@/components/common/ArticleSection";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { resolveEffectCategoryIcon } from "@/features/effects/pages/effectsIndexConfig";
import { CaptionedImage } from "@/features/effects/vcode/components/CaptionedImage";
import {
  resolveArtistCreditLink,
  type ArtistCreditLinks,
} from "@/features/effects/vcode/artistCreditLinks";
import { t } from "@/i18n/server";
import type { PublicEffectSummary } from "@server/data/publicData";

import { PsychoactiveEffectLongSummary } from "./PsychoactiveEffectLongSummary";
import type {
  PsychoactiveSummaryDefinition,
  PsychoactiveSummarySectionDefinition,
} from "./summaryDefinitions";

interface PsychoactiveSummarySection extends PsychoactiveSummarySectionDefinition {
  effects: PublicEffectSummary[];
}

interface PsychoactiveSummaryPageProps {
  definition: PsychoactiveSummaryDefinition;
  sections: PsychoactiveSummarySection[];
  artistCreditLinks?: ArtistCreditLinks;
}

export function PsychoactiveSummaryPage({
  definition,
  sections,
  artistCreditLinks,
}: PsychoactiveSummaryPageProps) {
  const heroCredit = resolveArtistCreditLink(
    artistCreditLinks,
    definition.image?.artist,
  );
  // Definition keys are "<class>" or "<class>-<facet>" ("deliriant",
  // "psychedelic-visual"), and the per-class image variants an article embed
  // carries are keyed on the class alone.
  const [mediaVariantKey] = definition.key.split("-");

  return (
    <PublicContentShell width="standard" focusTarget>
      <PageHeader title={t(definition.title)} icon={definition.icon} />

      <div className="mx-auto max-w-4xl space-y-10">
        <section className="flow-root">
          {definition.image ? (
            <CaptionedImage
              src={definition.image.src}
              width={definition.image.width}
              artist={definition.image.artist}
              artistHref={heroCredit?.href}
              artistHrefExternal={heroCredit?.external}
              title={definition.image.title}
              caption={definition.image.title}
              align={definition.image.align}
              border
              top
            />
          ) : null}

          <div className="theme-accent-emphasis-scope theme-text-secondary space-y-4 text-[1.0625rem] leading-7">
            {definition.intro.map((paragraph, index) => (
              <p
                key={`${definition.key}-intro-${index}`}
                className={
                  paragraph.italic ? "theme-text-muted italic" : undefined
                }
                dangerouslySetInnerHTML={{ __html: t(paragraph.html) }}
              />
            ))}
          </div>
        </section>

        <div className="theme-horizontal-divider" />

        {sections.map((section) => (
          <ArticleSection
            key={section.title}
            id={section.title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")}
            icon={resolveEffectCategoryIcon(section.title) ?? section.icon ?? "lucide:layout-list"}
            heading={t(section.title)}
            spacing="effect"
          >
            <p
              className="theme-accent-emphasis-scope theme-text-muted max-w-[72ch] text-[0.9375rem] leading-relaxed"
              dangerouslySetInnerHTML={{ __html: t(section.definitionHtml) }}
            />

            {section.effects.length > 0 ? (
              <div className="space-y-8">
                {section.effects.map((effect) => (
                  <PsychoactiveEffectLongSummary
                    key={effect.slug}
                    effect={effect}
                    artistCreditLinks={artistCreditLinks}
                    mediaVariantKey={mediaVariantKey}
                  />
                ))}
              </div>
            ) : null}
          </ArticleSection>
        ))}

        <ArticleSection
          id="see-also"
          icon="lucide:book-open"
          heading={t("See Also")}
          spacing="effect"
        >
          <ul className="theme-text-secondary list-disc space-y-2 pl-5 marker:text-dose-accent-muted">
            {definition.seeAlso.map((item) => (
              <li key={item.href}>
                <SmartLink href={item.href} className={proseLinkClassName}>
                  {t(item.label)}
                </SmartLink>
              </li>
            ))}
          </ul>
        </ArticleSection>
      </div>
    </PublicContentShell>
  );
}
