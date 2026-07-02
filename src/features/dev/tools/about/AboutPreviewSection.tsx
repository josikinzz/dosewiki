import { AboutMissionMarkdown } from "@/components/pages/AboutMissionMarkdown";
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
 * Renders the editable About content with the same components the public
 * page uses (`AboutMissionMarkdown`, `PublicSectionHeading`,
 * `ContributorCard`) so the preview cannot drift from what publishing
 * produces. The public hero and the Data/Docs tabs are not editable here,
 * so they are intentionally omitted.
 */
export function AboutPreviewSection({
  resolvedPreviewMarkdown,
  selectedFounders,
}: AboutPreviewSectionProps) {
  return (
    <EditorSection
      icon="lucide:eye"
      title="Live preview"
      description="Rendered with the same components as the public About page's Mission and Contributors tabs."
    >
      <NestedContentCard variant="subtle" padding="lg" radius="xl" className="space-y-10">
        <section className="space-y-6">
          <PublicSectionHeading icon="lucide:book-open" title="Project Mission" />
          <AboutMissionMarkdown content={resolvedPreviewMarkdown} />
        </section>

        <section className="space-y-6">
          <PublicSectionHeading icon="lucide:users" title="Founders & Contributors" />
          {selectedFounders.length > 0 ? (
            <ul className="grid gap-4 sm:grid-cols-2">
              {selectedFounders.map((profile) => (
                <li key={profile.key}>
                  <ContributorCard
                    contributor={profile}
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
