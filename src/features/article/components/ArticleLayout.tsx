import { type ReactNode } from "react";
import { StickyTocLayout } from "@/components/common/StickyTocLayout";
import { buildArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";
import type { SubstanceArticle } from "@/schema";
import type { MoleculeAsset, SubstanceContent } from "@/types/content";
import type { TripReport } from "@/types/tripReport";
import type { NormalizedReagentData } from "@/lib/reagentTesting";
import { slugify } from "@/utils/slug";
import {
  SAFETY_BANNER_ICON_SIZE_DEFAULT,
  type WarningBannerPreset,
} from "@/data/substanceWarningBanners";
import { BetaDisclaimer } from "@/components/common/BetaDisclaimer";
import { IconSpriteScope } from "@/components/common/IconSprite";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { PiruOpenChip } from "../piru/PiruLinks.client";
import { HeroSection } from "./sections/HeroSection";
import { HeroSummaryContent } from "./sections/HeroSummaryContent";
import { DosageDurationSection } from "./sections/DosageDurationSection";
import { SubjectiveEffectsSection } from "./sections/SubjectiveEffectsSection";
import { PharmacologySection } from "./sections/PharmacologySection";
import { InteractionsSection } from "./sections/InteractionsSection";
import { ToleranceSection } from "./sections/ToleranceSection";
import { HistoryCultureSection } from "./sections/HistoryCultureSection";
import { HarmPotentialSection } from "./sections/HarmPotentialSection";
import { ReagentSection } from "./sections/ReagentSection";
import { LegalitySection } from "./sections/LegalitySection";
import { CitationsSection } from "./sections/CitationsSection";
import {
  ContributorsSection,
  type ContributorAvatarMap,
} from "./sections/ContributorsSection";
import {
  resolveContributorHref,
  type ContributorDirectory,
} from "@server/contributorDirectory";
import type { ArticleRecentChange } from "@/data/changelog/articleRecentChanges";
import { FeedbackSection } from "./sections/FeedbackSection";
import { TripReportsSection } from "./sections/TripReportsSection";
import { reportMatchesSubstance } from "@/features/reports/domain/tripReportIndex";
import { ReviewStatusBanner } from "./sections/ReviewStatusBanner";
import { SubstanceWarningBanners } from "./sections/SubstanceWarningBanners";
import { ArticleTableOfContents } from "./sections/ArticleTableOfContents";
import type { TranslatorNoteSection } from "@server/translation/translatorNoteTypes";
import ArticleSectionEditor from "../editing/ArticleSectionEditor.editor";
import WarningContextualEditor from "../editing/WarningContextualEditor.editor";

export interface ArticleSecondarySections {
  toc: ReactNode;
  tocStrip: ReactNode;
  reviewStatus: ReactNode;
  contributors: ReactNode;
  subjectiveEffectsAttribution: ReactNode;
}

export interface ArticleLayoutProps {
  article: SubstanceArticle;
  content?: SubstanceContent;
  moleculeOverrideUrl?: string | null;
  fromSubstanceSlug?: string;
  linkableSubstanceSlugs?: readonly string[];
  linkableCategoryKeys?: readonly string[];
  relatedTripReports?: TripReport[];
  tripReportsSection?: ReactNode;
  hasRelatedTripReports?: boolean;
  replicationShowcaseSection?: ReactNode;
  secondarySections?: ArticleSecondarySections;
  contributorAvatars?: ContributorAvatarMap;
  contributorDirectory?: ContributorDirectory;
  externalReagentData?: NormalizedReagentData | null;
  warningBanners?: WarningBannerPreset[];
  warningBannerNotice?: ReactNode;
  showBetaDisclaimer?: boolean;
  warningBannerIconSize?: number;
  dosageDisclaimer?: string;
  toleranceDisclaimer?: string;
  reviewStatusCopy?: string;
  expertReviewCredit?: string;
  recentChanges?: ArticleRecentChange[];
  translatorNotes?: Partial<Record<TranslatorNoteSection, ReactNode>>;
}

interface DeferredSectionProps {
  children: ReactNode;
}

function DeferredSection({ children }: DeferredSectionProps) {
  return (
    <div className="theme-article-section-bleed space-y-2">{children}</div>
  );
}

const articleMovementsClassName = "flex flex-col gap-28 sm:gap-32 lg:gap-36";
const articleMovementClassName = "flex flex-col gap-14 sm:gap-16 lg:gap-20";

export function ArticleLayout({
  article,
  content,
  moleculeOverrideUrl,
  fromSubstanceSlug,
  linkableSubstanceSlugs,
  linkableCategoryKeys,
  relatedTripReports,
  tripReportsSection,
  hasRelatedTripReports,
  replicationShowcaseSection,
  secondarySections,
  contributorAvatars,
  contributorDirectory,
  externalReagentData,
  warningBanners = [],
  warningBannerNotice,
  showBetaDisclaimer = false,
  warningBannerIconSize = SAFETY_BANNER_ICON_SIZE_DEFAULT,
  dosageDisclaimer,
  toleranceDisclaimer,
  reviewStatusCopy,
  expertReviewCredit,
  recentChanges,
  translatorNotes,
}: ArticleLayoutProps) {
  const directory = contributorDirectory ?? [];
  const creditHrefs = {
    josie: resolveContributorHref("Josie Kins", directory),
    lyrea: resolveContributorHref("Lyrea", directory),
  };
  const subjectiveEffectsAttributionAuthor =
    article.subjective_effects?.attribution?.author;
  const subjectiveEffectsAttributionHref = subjectiveEffectsAttributionAuthor
    ? resolveContributorHref(subjectiveEffectsAttributionAuthor, directory)
    : null;

  const tocHasTripReports =
    hasRelatedTripReports ??
    relatedTripReports?.some((report) =>
      reportMatchesSubstance(report, article),
    ) ??
    false;

  const chemistryPresentation =
    content?.chemistryPresentation ??
    buildArticleChemistryPresentation(article);
  const moleculeAssets: MoleculeAsset[] = moleculeOverrideUrl
    ? [
        {
          filename: `${article.id}.svg`,
          url: moleculeOverrideUrl,
          matchedField: "data-molecule",
          matchedValue: String(article.id),
          resolution: "data-canonical",
        },
      ]
    : (content?.moleculeAssets ?? []);

  const piruSlug = SITE_FLAVOR_CONFIG.showPiruLinks
    ? fromSubstanceSlug
    : undefined;

  return (
    <IconSpriteScope>
      <StickyTocLayout
        toc={
          secondarySections?.toc ?? (
            <ArticleTableOfContents
              article={article}
              variant="bare"
              substanceSlug={fromSubstanceSlug}
              hasTripReports={tocHasTripReports}
              externalReagentData={externalReagentData}
            />
          )
        }
        contentClassName="gap-8"
        className="theme-toc-strip-scope"
      >
        {secondarySections?.tocStrip ?? (
          <ArticleTableOfContents
            article={article}
            variant="strip"
            substanceSlug={fromSubstanceSlug}
            hasTripReports={tocHasTripReports}
            externalReagentData={externalReagentData}
          />
        )}

        {showBetaDisclaimer && (
          <div className="text-center text-sm italic text-balance">
            <BetaDisclaimer />
          </div>
        )}

        {secondarySections?.reviewStatus ?? (
          <ReviewStatusBanner
            article={article}
            avatarSrc={contributorAvatars?.lyrea}
            profileHref={creditHrefs.lyrea}
            copy={reviewStatusCopy}
          />
        )}

        {warningBannerNotice}
        <SubstanceWarningBanners
          banners={warningBanners}
          iconSize={warningBannerIconSize}
        />
        <div className="flex flex-wrap items-center gap-2 empty:hidden">
          {fromSubstanceSlug && (
            <WarningContextualEditor
              slug={fromSubstanceSlug}
              iconSize={warningBannerIconSize}
            />
          )}
          <ArticleSectionEditor
            section="summary"
            missing={!article.summary}
            labeled
          />
          <ArticleSectionEditor section="identification" labeled />
          <ArticleSectionEditor section="classification" labeled />
        </div>

        <HeroSection
          article={article}
          chemistryPresentation={chemistryPresentation}
          moleculeAsset={moleculeAssets[0]}
          moleculeAssets={moleculeAssets}
          summaryContent={
            <HeroSummaryContent
              article={article}
              hasMolecule={Boolean(moleculeAssets[0]?.url)}
            />
          }
          linkableCategoryKeys={linkableCategoryKeys}
          showPreviewBadge={false}
          nameRowAction={
            piruSlug ? <PiruOpenChip slug={piruSlug} /> : undefined
          }
        />

        <div className={articleMovementsClassName}>
          <div className={articleMovementClassName}>
            <DeferredSection>
              <ArticleSectionEditor
                section="dosage"
                missing={
                  !article.dosage.routes.length &&
                  !article.duration.routes.length
                }
              />
              <DosageDurationSection
                article={article}
                dosageDisclaimer={dosageDisclaimer}
                piruSlug={piruSlug}
              />
              {translatorNotes?.["dosage-duration"]}
            </DeferredSection>
            <DeferredSection>
              <div className="flex flex-wrap items-center gap-2 empty:hidden">
                <ArticleSectionEditor
                  section="subjective_effects"
                  missing={!article.subjective_effects}
                />
                <ArticleSectionEditor
                  section="comparisons"
                  missing={!article.comparisons?.length}
                  labeled
                />
              </div>
              <SubjectiveEffectsSection
                article={article}
                attributionHref={subjectiveEffectsAttributionHref}
                attributionSection={
                  secondarySections?.subjectiveEffectsAttribution
                }
                replicationShowcaseSection={replicationShowcaseSection}
              />
              {translatorNotes?.["subjective-effects"]}
            </DeferredSection>
            <DeferredSection>
              <ArticleSectionEditor
                section="reagent_testing"
                missing={!Object.keys(article.reagent_testing ?? {}).length}
              />
              <ReagentSection
                article={article}
                chemistryPresentation={chemistryPresentation}
                substanceSlug={fromSubstanceSlug}
                externalReagentData={externalReagentData}
              />
              {translatorNotes?.["reagent-testing"]}
            </DeferredSection>
          </div>

          <div className={articleMovementClassName}>
            <DeferredSection>
              <ArticleSectionEditor section="pharmacology" />
              <PharmacologySection article={article} />
              {translatorNotes?.pharmacology}
            </DeferredSection>
            <DeferredSection>
              <ArticleSectionEditor section="interactions" />
              <InteractionsSection
                article={article}
                linkableSubstanceSlugs={linkableSubstanceSlugs}
              />
              {translatorNotes?.interactions}
            </DeferredSection>
            <DeferredSection>
              <ArticleSectionEditor section="tolerance" />
              <ToleranceSection
                article={article}
                disclaimer={toleranceDisclaimer}
              />
              {translatorNotes?.tolerance}
            </DeferredSection>
          </div>

          <div className={articleMovementClassName}>
            <DeferredSection>
              <ArticleSectionEditor section="harm_potential" />
              <HarmPotentialSection article={article} />
              {translatorNotes?.["harm-potential"]}
            </DeferredSection>
            <DeferredSection>
              <ArticleSectionEditor
                section="history_culture"
                missing={!article.history_culture}
              />
              <HistoryCultureSection article={article} />
              {translatorNotes?.["history-culture"]}
            </DeferredSection>
            <DeferredSection>
              {tripReportsSection ?? (
                <TripReportsSection
                  reports={relatedTripReports}
                  fromSubstanceSlug={fromSubstanceSlug}
                />
              )}
            </DeferredSection>
            <DeferredSection>
              <ArticleSectionEditor
                section="legality"
                missing={!Object.keys(article.legality.countries ?? {}).length}
              />
              <LegalitySection article={article} />
              {translatorNotes?.legality}
            </DeferredSection>
          </div>

          <div className={articleMovementClassName}>
            <DeferredSection>
              <ArticleSectionEditor
                section="references"
                missing={!article.references?.length}
              />
              <CitationsSection article={article} />
            </DeferredSection>
          </div>

          <div className={articleMovementClassName}>
            <DeferredSection>
              {secondarySections?.contributors ?? (
                <ContributorsSection
                  article={article}
                  avatars={contributorAvatars}
                  profileHrefs={creditHrefs}
                  expertReviewCredit={expertReviewCredit}
                  reviewStatusCopy={reviewStatusCopy}
                  recentChanges={recentChanges}
                />
              )}
            </DeferredSection>
            <DeferredSection>
              <FeedbackSection
                substanceTitle={
                  article.title ||
                  article.identification?.common_name ||
                  "this substance"
                }
                substanceSlug={
                  fromSubstanceSlug ??
                  slugify(
                    article.identification?.common_name || article.title || "",
                  )
                }
              />
            </DeferredSection>
          </div>
        </div>
      </StickyTocLayout>
    </IconSpriteScope>
  );
}
