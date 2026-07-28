import Link from "next/link";

import { ArticleSection } from "@/components/common/ArticleSection";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { CaptionedImage } from "@/features/effects/vcode/components/CaptionedImage";
import type { PublicEffectArticle } from "@server/convex/publicData";

import { PsychoactiveEffectLongSummary } from "./PsychoactiveEffectLongSummary";
import type {
  PsychoactiveSummaryDefinition,
  PsychoactiveSummarySectionDefinition,
} from "./summaryDefinitions";

interface PsychoactiveSummarySection
  extends PsychoactiveSummarySectionDefinition {
  effects: PublicEffectArticle[];
}

interface PsychoactiveSummaryPageProps {
  definition: PsychoactiveSummaryDefinition;
  sections: PsychoactiveSummarySection[];
}

export function PsychoactiveSummaryPage({
  definition,
  sections,
}: PsychoactiveSummaryPageProps) {
  return (
    <PublicContentShell width="standard" focusTarget>
      <PageHeader
        title={definition.title}
        icon={definition.icon}
        prominentMobileIcon
      />

      <div className="mx-auto max-w-4xl space-y-10">
        <section className="flow-root">
          {definition.image ? (
            <CaptionedImage
              src={definition.image.src}
              width={definition.image.width}
              artist={definition.image.artist}
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
                className={paragraph.italic ? "theme-text-muted italic" : undefined}
                dangerouslySetInnerHTML={{ __html: paragraph.html }}
              />
            ))}
          </div>
        </section>

        <div className="theme-horizontal-divider" />

        {sections.map((section) => (
          <ArticleSection
            key={section.title}
            id={section.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}
            icon={section.icon}
            heading={section.title}
            spacing="effect"
          >
            <p
              className="theme-accent-emphasis-scope theme-text-muted max-w-[72ch] text-[0.9375rem] leading-relaxed"
              dangerouslySetInnerHTML={{ __html: section.definitionHtml }}
            />

            {section.effects.length > 0 ? (
              <div className="space-y-8">
                {section.effects.map((effect) => (
                  <PsychoactiveEffectLongSummary
                    key={effect.slug}
                    effect={effect}
                  />
                ))}
              </div>
            ) : null}
          </ArticleSection>
        ))}

        <ArticleSection
          id="see-also"
          icon="lucide:book-open"
          heading="See Also"
          spacing="effect"
        >
          <ul className="theme-text-secondary list-disc space-y-2 pl-5 marker:text-dose-accent-muted">
            {definition.seeAlso.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={proseLinkClassName}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </ArticleSection>
      </div>
    </PublicContentShell>
  );
}
