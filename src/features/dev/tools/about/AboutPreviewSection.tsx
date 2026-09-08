import { AboutMissionMarkdown } from "@/components/pages/AboutMissionMarkdown";
import { splitAboutMarkdown } from "@/data/content/aboutSections";
import {
  ContributorCard,
  PublicSectionHeading,
} from "@/components/layout/PublicPagePrimitives";
import { NestedContentCard } from "@/components/ui/surface";
import { EditorSection } from "@/features/dev/components";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import { publicHref } from "@/utils/publicHref";

type AboutPreviewSectionProps = {
  resolvedPreviewMarkdown: string;
  selectedFounders: NormalizedUserProfile[];
};

/**
 * Renders editable About sections with the public page's Markdown renderer,
 * headings, and contributor cards. The hero and noneditable sections are omitted.
 */
export function AboutPreviewSection({
  resolvedPreviewMarkdown,
  selectedFounders,
}: AboutPreviewSectionProps) {
  const { introduction, sources, history } = splitAboutMarkdown(resolvedPreviewMarkdown);
  return (
    <EditorSection
      icon="lucide:eye"
      title="Live preview"
      description="Rendered in public page order: Introduction, Sources and review, then Founders & Contributors."
    >
      <NestedContentCard variant="subtle" padding="lg" radius="xl" className="space-y-10">
        <section className="space-y-6">
          <PublicSectionHeading icon="lucide:book-open" title="Introduction" />
          <AboutMissionMarkdown content={introduction} />
        </section>
        {sources ? (
          <section className="space-y-6">
            <PublicSectionHeading icon="lucide:book-open" title="Sources and review" />
            <AboutMissionMarkdown content={sources} />
          </section>
        ) : null}

        <section className="space-y-6">
          <PublicSectionHeading icon="lucide:users" title="Founders & Contributors" />
          {history ? (
            <div className="space-y-4">
              <h3 className="theme-text-primary text-lg font-semibold">Project history</h3>
              <AboutMissionMarkdown content={history} />
            </div>
          ) : null}
          {selectedFounders.length > 0 ? (
            <ul className="grid gap-4 sm:grid-cols-2">
              {selectedFounders.map((profile) => (
                <li key={profile.key}>
                  <ContributorCard
                    contributor={{ ...profile, subtitle: profile.role }}
                    href={publicHref.contributor(profile.key)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-8 text-center">
              <p className="theme-text-faint text-sm">
                Founder profiles have not been published yet. Pin contributors
                from the Dev Tools About tab to surface them here.
              </p>
            </div>
          )}
        </section>
      </NestedContentCard>
    </EditorSection>
  );
}
