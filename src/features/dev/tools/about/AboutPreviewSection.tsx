import { AboutMissionMarkdown } from "@/components/pages/AboutMissionMarkdown";
import { splitAboutMarkdown } from "@/data/content/aboutSections";
import {
  ContributorCard,
  PublicSectionHeading,
} from "@/components/layout/PublicPagePrimitives";
import { NestedContentCard } from "@/components/ui/surface";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import { publicHref } from "@/utils/publicHref";

type AboutPreviewSectionProps = {
  resolvedPreviewMarkdown: string;
  resolvedSubtitle?: string;
  selectedFounders: NormalizedUserProfile[];
};

export function AboutPreviewSection({
  resolvedPreviewMarkdown,
  resolvedSubtitle,
  selectedFounders,
}: AboutPreviewSectionProps) {
  const { introduction, sources, history } = splitAboutMarkdown(resolvedPreviewMarkdown);
  return (
    <section aria-label="Preview" className="min-w-0 space-y-3">
      <p className="type-meta-label theme-text-muted">Preview, as the About page</p>
      <NestedContentCard variant="subtle" padding="lg" radius="xl" className="space-y-10">
        {resolvedSubtitle ? (
          <p className="type-deck theme-text-secondary">{resolvedSubtitle}</p>
        ) : null}
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
                No founders are listed. Add them under Founders and they show here.
              </p>
            </div>
          )}
        </section>
      </NestedContentCard>
    </section>
  );
}
