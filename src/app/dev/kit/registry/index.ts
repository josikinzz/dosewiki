import type { KitTier, StoryDef } from "./types";

import { alertStory } from "../stories/alert.story";
import { badgeStory } from "../stories/badge.story";
import { buttonStory } from "../stories/button.story";
import { cardStory } from "../stories/card.story";
import { commandStory } from "../stories/command.story";
import { dialogStory } from "../stories/dialog.story";
import { dropdownMenuStory } from "../stories/dropdown-menu.story";
import { inputStory } from "../stories/input.story";
import { labelStory } from "../stories/label.story";
import { motionCardStory } from "../stories/motion-card.story";
import { popoverStory } from "../stories/popover.story";
import { safetyBannerStory } from "../stories/safety-banner.story";
import { selectStory } from "../stories/select.story";
import { surfaceStory } from "../stories/surface.story";
import { tabsStory } from "../stories/tabs.story";
import { textareaStory } from "../stories/textarea.story";
import { toggleStory } from "../stories/toggle.story";
import { toggleGroupStory } from "../stories/toggle-group.story";

import { appImageStory } from "../stories/app-image.story";
import { articleCitationListStory } from "../stories/article-citation-list.story";
import { articleExpandableStory } from "../stories/article-expandable.story";
import { articleSectionStory } from "../stories/article-section.story";
import { bulletStory } from "../stories/bullet.story";
import { citationListItemStory } from "../stories/citation-list-item.story";
import { customIconsStory } from "../stories/custom-icons.story";
import { definitionListStory } from "../stories/definition-list.story";
import { disclosureCardStory } from "../stories/disclosure-card.story";
import { doseWikiLogoStory } from "../stories/dose-wiki-logo.story";
import { errorBoundaryStory } from "../stories/error-boundary.story";
import { expandButtonStory } from "../stories/expand-button.story";
import { externalSourcePillStory } from "../stories/external-source-pill.story";
import { globalSearchStory } from "../stories/global-search.story";
import { highlightedTextStory } from "../stories/highlighted-text.story";
import { iconStory } from "../stories/icon.story";
import { iconBadgeStory } from "../stories/icon-badge.story";
import { indexCardStory } from "../stories/index-card.story";
import { indexPanelLayoutStory } from "../stories/index-panel-layout.story";
import { loadingScreenStory } from "../stories/loading-screen.story";
import { proseLinkStory } from "../stories/prose-link.story";
import { publicTableOfContentsStory } from "../stories/public-table-of-contents.story";
import { publicTocStripStory } from "../stories/public-toc-strip.story";
import { publicTokensStory } from "../stories/public-tokens.story";
import { referenceListStory } from "../stories/reference-list.story";
import { routeAnnouncerStory } from "../stories/route-announcer.story";
import { searchEmptyStateStory } from "../stories/search-empty-state.story";
import { sectionCardStory } from "../stories/section-card.story";
import { sectionHeaderStory } from "../stories/section-header.story";
import { siteBrandStory } from "../stories/site-brand.story";
import { smartLinkStory } from "../stories/smart-link.story";
import { siteSupporterStory } from "../stories/site-supporter.story";
import { stateCardStory } from "../stories/state-card.story";
import { statusBadgeStory } from "../stories/status-badge.story";
import { stickyTocLayoutStory } from "../stories/sticky-toc-layout.story";

import { appearanceCogStory } from "../stories/appearance-cog.story";
import { footerStory } from "../stories/footer.story";
import { headerStory } from "../stories/header.story";
import { pageHeaderStory } from "../stories/page-header.story";
import { publicContentPrimitivesStory } from "../stories/public-content-primitives.story";
import { publicFeedbackPrimitivesStory } from "../stories/public-feedback-primitives.story";
import { publicPagePrimitivesStory } from "../stories/public-page-primitives.story";
import { publicSegmentedTabsStory } from "../stories/public-segmented-tabs.story";

import { editorKitStories } from "../stories/editor-kit.story";
import { editorShellStories } from "../stories/editor-shell.story";

export const stories: StoryDef[] = [
  alertStory,
  badgeStory,
  buttonStory,
  cardStory,
  commandStory,
  dialogStory,
  dropdownMenuStory,
  inputStory,
  labelStory,
  motionCardStory,
  popoverStory,
  safetyBannerStory,
  selectStory,
  surfaceStory,
  tabsStory,
  textareaStory,
  toggleStory,
  toggleGroupStory,

  appImageStory,
  articleCitationListStory,
  articleExpandableStory,
  articleSectionStory,
  bulletStory,
  citationListItemStory,
  customIconsStory,
  definitionListStory,
  disclosureCardStory,
  doseWikiLogoStory,
  errorBoundaryStory,
  expandButtonStory,
  externalSourcePillStory,
  globalSearchStory,
  highlightedTextStory,
  iconStory,
  iconBadgeStory,
  indexCardStory,
  indexPanelLayoutStory,
  loadingScreenStory,
  proseLinkStory,
  publicTableOfContentsStory,
  publicTocStripStory,
  publicTokensStory,
  referenceListStory,
  routeAnnouncerStory,
  searchEmptyStateStory,
  sectionCardStory,
  sectionHeaderStory,
  siteBrandStory,
  smartLinkStory,
  siteSupporterStory,
  stateCardStory,
  statusBadgeStory,
  stickyTocLayoutStory,

  appearanceCogStory,
  footerStory,
  headerStory,
  pageHeaderStory,
  publicContentPrimitivesStory,
  publicFeedbackPrimitivesStory,
  publicPagePrimitivesStory,
  publicSegmentedTabsStory,

  ...editorKitStories,
  ...editorShellStories,
];

export function storiesByTier(tier: KitTier): StoryDef[] {
  return stories
    .filter((story) => story.tier === tier)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function documentedExports(): string[] {
  return Array.from(new Set(stories.flatMap((story) => story.exports)));
}
