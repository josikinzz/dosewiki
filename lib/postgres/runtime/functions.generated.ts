// GENERATED FILE. Do not edit by hand.
// Producer: scripts/postgres/generateFunctionRegistry.ts
// Inputs: runtime/functionOwnership.json and owned function modules.

import * as articleFeedback from "../../../server/articleFeedback";
import * as articleLifecycle from "../../../server/articleLifecycle";
import * as articleSources from "../../../server/articleSources";
import * as authorAttribution from "../../../server/authorAttribution";
import * as bindingSiteMigration from "../../../server/bindingSiteMigration";
import * as categoryLayout from "../../../server/categoryLayout";
import * as changeProposalReview from "../../../server/changeProposalReview";
import * as changeProposals from "../../../server/changeProposals";
import * as changelog from "../../../server/changelog";
import * as citationEvidence from "../../../server/citationEvidence";
import * as contentRevisions from "../../../server/contentRevisions";
import * as contributorProfileMerges from "../../../server/contributorProfileMerges";
import * as contributorProfiles from "../../../server/contributorProfiles";
import * as copyBlocks from "../../../server/copyBlocks";
import * as effectIndexArchive from "../../../server/effectIndexArchive";
import * as effectIndexArticles from "../../../server/effectIndexArticles";
import * as indexLayouts from "../../../server/indexLayouts";
import * as inviteCodes from "../../../server/inviteCodes";
import * as mailingList from "../../../server/mailingList";
import * as memberships from "../../../server/memberships";
import * as moleculeClassTemplates from "../../../server/moleculeClassTemplates";
import * as moleculeEditor from "../../../server/moleculeEditor";
import * as moleculeOverrides from "../../../server/moleculeOverrides";
import * as prompts from "../../../server/prompts";
import * as publicArtistCredits from "../../../server/publicArtistCredits";
import * as publicOverview from "../../../server/publicOverview";
import * as publicReadIndexes from "../../../server/publicReadIndexes";
import * as publicReplicationIdentitySocial from "../../../server/publicReplicationIdentitySocial";
import * as publicationRecovery from "../../../server/publicationRecovery";
import * as quotes from "../../../server/quotes";
import * as reagentTestContract from "../../../server/reagentTestContract";
import * as reagentTests from "../../../server/reagentTests";
import * as replicationAttribution from "../../../server/replicationAttribution";
import * as replicationContextualEditing from "../../../server/replicationContextualEditing";
import * as replicationDates from "../../../server/replicationDates";
import * as replicationDuplicates from "../../../server/replicationDuplicates";
import * as replicationIdentitySocial from "../../../server/replicationIdentitySocial";
import * as replicationPlaylists from "../../../server/replicationPlaylists";
import * as replicationTaxonomy from "../../../server/replicationTaxonomy";
import * as replications from "../../../server/replications";
import * as siteConfig from "../../../server/siteConfig";
import * as siteFeedback from "../../../server/siteFeedback";
import * as subjectiveEffects from "../../../server/subjectiveEffects";
import * as substanceGalleries from "../../../server/substanceGalleries";
import * as substanceIndex from "../../../server/substanceIndex";
import * as tripReportContract from "../../../server/tripReportContract";
import * as tripReportSubmissions from "../../../server/tripReportSubmissions";
import * as tripReports from "../../../server/tripReports";
import * as warningBanners from "../../../server/warningBanners";

/** Server-only callable modules. Helper exports are not callable registrations. */
export const functionModules: Record<string, Record<string, unknown>> = {
  articleFeedback,
  articleLifecycle,
  articleSources,
  authorAttribution,
  bindingSiteMigration,
  categoryLayout,
  changeProposalReview,
  changeProposals,
  changelog,
  citationEvidence,
  contentRevisions,
  contributorProfileMerges,
  contributorProfiles,
  copyBlocks,
  effectIndexArchive,
  effectIndexArticles,
  indexLayouts,
  inviteCodes,
  mailingList,
  memberships,
  moleculeClassTemplates,
  moleculeEditor,
  moleculeOverrides,
  prompts,
  publicArtistCredits,
  publicOverview,
  publicReadIndexes,
  publicReplicationIdentitySocial,
  publicationRecovery,
  quotes,
  reagentTestContract,
  reagentTests,
  replicationAttribution,
  replicationContextualEditing,
  replicationDates,
  replicationDuplicates,
  replicationIdentitySocial,
  replicationPlaylists,
  replicationTaxonomy,
  replications,
  siteConfig,
  siteFeedback,
  subjectiveEffects,
  substanceGalleries,
  substanceIndex,
  tripReportContract,
  tripReportSubmissions,
  tripReports,
  warningBanners,
};
