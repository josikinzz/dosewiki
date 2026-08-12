"use client";

import type { NormalizedUserProfile } from "@/data/userProfiles";
import { WritingWorkbench } from "./WritingWorkbench";

interface BlogTabProps {
  contributorProfiles: NormalizedUserProfile[];
  profilesLoading?: boolean;
  /** `/dev/blog/<slug>`. */
  initialSlug?: string;
}

/**
 * The Blog tab — the same editor bones as Writing, publishing `kind: "blog"`
 * rows to dose.wiki's `/blog`.
 *
 * A separate tab rather than a filter on Writing because a blog post is a
 * specific thing: it leads with a cover image and a teaser, and both are given
 * top billing in the form here in a way they are not for an article.
 *
 * This has nothing to do with the frozen Effect Index blog archive, which lives
 * in a different table and is served only on the Effect Index flavor. Nothing
 * written here can appear there, and nothing there can appear here.
 */
export function BlogTab({ contributorProfiles, profilesLoading, initialSlug }: BlogTabProps) {
  return (
    <WritingWorkbench
      kind="blog"
      heading="Blog"
      description="Posts published to /blog on dose.wiki. Cover image and teaser lead the index card."
      emphasiseCover
      contributorProfiles={contributorProfiles}
      profilesLoading={profilesLoading}
      initialSelection={initialSlug}
    />
  );
}
