"use client";

import type { ComponentProps } from "react";

import { AboutEditorTab } from "../about/AboutEditorTab";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import { WritingWorkbench } from "./WritingWorkbench";

interface WritingTabProps {
  aboutTabProps: ComponentProps<typeof AboutEditorTab>;
  contributorProfiles: NormalizedUserProfile[];
  profilesLoading?: boolean;
  /** `/dev/writing/<slug>`, or `about` from the retired `/dev/about` link. */
  initialSlug?: string;
}

/**
 * The Writing tab: site articles, plus About as the pinned first entry of the
 * rail.
 *
 * About is here rather than in a tab of its own because it is one page of
 * writing among the others; folding it in is a move of the rail entry only. Its
 * editor, its storage in `siteConfig`, its placeholder engine and its founder
 * picker are all untouched — this tab renders the same `AboutEditorTab` with
 * the same props the shell has always built for it.
 */
export function WritingTab({
  aboutTabProps,
  contributorProfiles,
  profilesLoading,
  initialSlug,
}: WritingTabProps) {
  return (
    <WritingWorkbench
      kind="article"
      heading="Writing"
      description="Articles published to /articles, written in Markdown. Drafts stay off the public site entirely."
      contributorProfiles={contributorProfiles}
      profilesLoading={profilesLoading}
      initialSelection={initialSlug}
      pinnedEntry={{
        id: "about",
        title: "About",
        subtitle: "The /about page",
        render: () => <AboutEditorTab {...aboutTabProps} />,
      }}
    />
  );
}
