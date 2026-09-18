import { GlossaryUsageDisclosure } from "@/components/glossary/GlossaryUsageDisclosure";
import { DefinitionList, DefinitionRow } from "@/components/common/DefinitionList";
import { PublicPill } from "@/components/common/PublicTokens";
import { StateCard } from "@/components/common/StateCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell, PublicSectionHeading } from "@/components/layout/PublicPagePrimitives";
import { msg } from "@/i18n/messages";
import { t } from "@/i18n/server";
import {
  GLOSSARY_CATEGORIES,
  OTHER_CATEGORY,
  categoryForKind,
  kindLabel,
  type GlossaryCategory,
} from "@/lib/glossary/glossaryCategories";

/** One term as the page shows it: the gloss when one is written, the mirror's rendering when on a mirror. */
export type GlossaryPageEntry = {
  term: string;
  kind: string;
  gloss: string | null;
  rendering: string | null;
};

export type GlossaryPageGroup = { category: GlossaryCategory; entries: GlossaryPageEntry[] };

/** The one-paragraph intro; also the page's meta description, so the two never drift. */
export const GLOSSARY_INTRO = msg(
  "The fixed vocabulary of this site: what each term means here and, on a translated mirror, how it is rendered.",
);

/**
 * Fold the stored glosses and, on a mirror, the locale's approved renderings
 * into one list per category. A term appears once whichever side names it: a
 * rendering without a gloss still lists the term, and a gloss without a
 * rendering shows in English alone. Categories keep the order of
 * `GLOSSARY_CATEGORIES`, "Other" trails, and empty ones are dropped.
 */
export function buildGlossaryGroups(
  glosses: readonly { term: string; kind: string; gloss: string }[],
  renderings: readonly { term: string; kind: string; target: string }[] = [],
): GlossaryPageGroup[] {
  const entries = new Map<string, GlossaryPageEntry>();
  for (const row of glosses) {
    entries.set(row.term, { term: row.term, kind: row.kind, gloss: row.gloss, rendering: null });
  }
  for (const row of renderings) {
    const entry = entries.get(row.term);
    if (entry) {
      entry.rendering = row.target;
    } else {
      entries.set(row.term, { term: row.term, kind: row.kind, gloss: null, rendering: row.target });
    }
  }

  const byCategory = new Map<string, GlossaryPageEntry[]>();
  for (const entry of entries.values()) {
    const category = categoryForKind(entry.kind);
    const bucket = byCategory.get(category.id);
    if (bucket) bucket.push(entry);
    else byCategory.set(category.id, [entry]);
  }

  return [...GLOSSARY_CATEGORIES, OTHER_CATEGORY].flatMap((category) => {
    const bucket = byCategory.get(category.id);
    if (!bucket) return [];
    bucket.sort((a, b) => a.term.localeCompare(b.term));
    return [{ category, entries: bucket }];
  });
}

interface GlossaryPageProps {
  groups: readonly GlossaryPageGroup[];
  /** The mirror's `lang` for its renderings; null on the English page. */
  renderingLang: string | null;
}

/**
 * The public glossary: every term the translation glossary fixes, grouped by
 * where it comes from on the site, with its one-line English definition and,
 * on a locale mirror, the rendering the mirror uses for it.
 */
export function GlossaryPage({ groups, renderingLang }: GlossaryPageProps) {
  return (
    <PublicContentShell focusTarget width="standard">
      <PageHeader icon="lucide:book-open-text" title={t(msg("Glossary"))} description={t(GLOSSARY_INTRO)} />
      {groups.length === 0 ? (
        <StateCard
          icon="lucide:book-open-text"
          tone="neutral"
          align="center"
          compact
          title={t("No glossary entries yet")}
          description={t("Definitions are written in the editor and appear here once the first one is saved.")}
        />
      ) : (
        <div className="space-y-12">
          {groups.map(({ category, entries }) => (
            <section key={category.id} id={category.id} className="scroll-mt-24 space-y-6">
              <PublicSectionHeading title={t(category.label)} />
              <DefinitionList className="divide-y divide-dose-border">
                {entries.map((entry) => (
                  <DefinitionRow
                    key={entry.term}
                    semantic
                    term={
                      <>
                        <span className="theme-text-primary font-semibold">{entry.term}</span>
                        {entry.rendering ? (
                          <span lang={renderingLang ?? undefined} className="theme-text-secondary">
                            {" "}
                            {entry.rendering}
                          </span>
                        ) : null}
                      </>
                    }
                    termClassName="text-base leading-6"
                    bodyClassName="flex flex-wrap items-baseline gap-x-3 gap-y-1"
                  >
                    {entry.gloss ? (
                      <span lang="en" className="theme-text-secondary text-sm leading-6">{entry.gloss}</span>
                    ) : null}
                    <PublicPill size="sm">{t(kindLabel(entry.kind))}</PublicPill>
                    <GlossaryUsageDisclosure term={entry.term} />
                  </DefinitionRow>
                ))}
              </DefinitionList>
            </section>
          ))}
        </div>
      )}
    </PublicContentShell>
  );
}
