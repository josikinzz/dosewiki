"use client";

import { useT } from "@/i18n/client";
import { ArticleCitationList } from "@/components/common/ArticleCitationList";
import { ArticleSection } from "@/components/common/ArticleSection";
import { ReferenceCitationList } from "@/components/common/ReferenceList";
import { projectEffectCitations } from "@/lib/citationProjection";

interface Citation {
  url: string;
  text: string;
  from?: string;
}

interface ExternalLink {
  url: string;
  title: string;
}

interface SeeAlso {
  location: string;
  title: string;
}

interface EffectCitationsSectionProps {
  id?: string;
  citations?: Citation[];
  externalLinks?: ExternalLink[];
  seeAlso?: SeeAlso[];
  linkableEffectSlugs?: readonly string[];
}

/**
 * References section for effect articles. Shares the substance article's
 * construction: grouped subsections under one "References" heading with the
 * Wikipedia-style numbered citation list.
 */
export function EffectCitationsSection({
  id = "sources",
  citations = [],
  externalLinks = [],
  seeAlso = [],
  linkableEffectSlugs,
}: EffectCitationsSectionProps) {
  const t = useT();
  const projection = projectEffectCitations({
    citations,
    externalLinks,
    seeAlso,
    expandedReferences: true,
  });
  const { internalRelatedLinks, externalLinks: projectedExternalLinks, references } = projection;
  const linkableEffectSlugSet = linkableEffectSlugs ? new Set(linkableEffectSlugs) : null;
  const visibleInternalRelatedLinks = {
    ...internalRelatedLinks,
    items: internalRelatedLinks.items.filter((item) => {
      const match = item.url.match(/^\/effects\/([^/]+)$/);
      return !match || !linkableEffectSlugSet || linkableEffectSlugSet.has(match[1]);
    }),
  };

  if (
    visibleInternalRelatedLinks.items.length === 0 &&
    projectedExternalLinks.items.length === 0 &&
    references.items.length === 0
  ) {
    return null;
  }

  const groups = [
    visibleInternalRelatedLinks.items.length > 0 && {
      key: "see-also",
      icon: "lucide:link",
      title: t(internalRelatedLinks.title),
      content: (
        <ul className="flex list-none flex-wrap gap-x-1.5 gap-y-1 p-0 text-sm">
          {visibleInternalRelatedLinks.items.map((item, index) => (
            <li key={index} className="inline">
              <a
                href={item.url}
                className="text-dose-accent hover:text-dose-accent-strong transition-colors"
              >
                {item.label}
              </a>
              {index < visibleInternalRelatedLinks.items.length - 1 && (
                <span className="text-dose-text-ghost ml-1.5">&middot;</span>
              )}
            </li>
          ))}
        </ul>
      ),
    },
    projectedExternalLinks.items.length > 0 && {
      key: "external-links",
      icon: "lucide:library",
      title: t(projectedExternalLinks.title),
      content: <ArticleCitationList citations={projectedExternalLinks.items} />,
    },
    references.items.length > 0 && {
      title: t("Citations"),
      icon: "codicon:references",
      content: <ReferenceCitationList citations={references.items} />,
    },
  ].filter((group): group is Exclude<typeof group, false> => Boolean(group));

  return (
    <ArticleSection
      id={id}
      icon="lucide:list-ordered"
      heading={t("References")}
      spacing="effect"
    >
      {groups.map((group, index) => (
        <ArticleSection.Group
          key={group.key}
          icon={group.icon}
          heading={group.title}
          className={index === 0 ? undefined : "pt-12"}
          spacing="loose"
        >
          {group.content}
        </ArticleSection.Group>
      ))}
    </ArticleSection>
  );
}
