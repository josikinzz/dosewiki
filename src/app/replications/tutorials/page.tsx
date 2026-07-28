import type { Metadata } from "next";
import Link from "next/link";

import { proseLinkClassName } from "@/components/common/ProseLink";
import { SectionCard } from "@/components/common/SectionCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { buildPublicPageMetadata } from "@server/next/publicSite";

const TUTORIALS = [
  {
    title: "Symmetrical Texture Repetition",
    href: "https://www.youtube.com/watch?v=3cUBq1tHO-A",
    artist: "Hyperactive_Filly",
    artistHref: "https://www.reddit.com/user/Hyperactive_Filly",
  },
  {
    title: "Tracer Tutorial",
    href: "https://www.youtube.com/watch?v=KaBBGipVly8",
    artist: "Hyperactive_Filly",
    artistHref: "https://www.reddit.com/user/Hyperactive_Filly",
  },
  {
    title: "Breathing / Shifting / Melting Tutorial",
    href: "https://www.youtube.com/watch?v=W6t9A-52-ZU",
    artist: "Hyperactive_Filly",
    artistHref: "https://www.reddit.com/user/Hyperactive_Filly",
  },
  {
    title: "Compositions / Multiple Effects",
    href: "https://www.youtube.com/watch?v=ZRDPPWTyM-A",
    artist: "Hyperactive_Filly",
    artistHref: "https://www.reddit.com/user/Hyperactive_Filly",
  },
  {
    title: "How to Format WEBM for Gfycat",
    href: "https://www.reddit.com/r/replications/comments/5bmzeo/how_to_produce_hd_webm_for_gfycat/",
    artist: "Hyperactive_Filly",
    artistHref: "https://www.reddit.com/user/Hyperactive_Filly",
  },
] as const;

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Replication Tutorials | dose.wiki",
  description:
    "Tutorials and resources for replicating specific subjective effects, preserved from the Effect Index archive.",
  route: { family: "replicationTutorials" },
});

export default function ReplicationTutorialsPage() {
  return (
    <PublicContentShell width="narrow" focusTarget>
      <PageHeader
        title="Tutorials"
        description="This page serves as a dedicated index for information and resources on replicating specific subjective effects."
        icon="lucide:list"
        prominentMobileIcon
      />

      <SectionCard>
        <ul className="theme-text-secondary space-y-4 text-[1.0625rem] leading-7 marker:text-dose-accent-muted">
          {TUTORIALS.map((tutorial) => (
            <li key={tutorial.href}>
              <a
                href={tutorial.href}
                target="_blank"
                rel="noopener noreferrer"
                className={proseLinkClassName}
              >
                <strong>{tutorial.title}</strong>
              </a>{" "}
              by{" "}
              <a
                href={tutorial.artistHref}
                target="_blank"
                rel="noopener noreferrer"
                className={proseLinkClassName}
              >
                {tutorial.artist}
              </a>
            </li>
          ))}
        </ul>

        <p className="theme-text-secondary mt-6 text-[1.0625rem] leading-7">
          For a collection of high res royalty free nature stock footage that can be used within
          replication videos, please{" "}
          <a
            href="http://mitchmartinez.com/free-4k-red-epic-stock-footage/"
            target="_blank"
            rel="noopener noreferrer"
            className={proseLinkClassName}
          >
            click here.
          </a>
        </p>

        <p className="theme-text-secondary mt-6 text-[1.0625rem] leading-7">
          For audio recreations of what an effect sounds like, see the{" "}
          <Link href="/replications/audio" className={proseLinkClassName}>
            audio replications
          </Link>
          .
        </p>

        <p className="theme-text-ghost mt-6 text-xs leading-5">
          Tutorials are linked to their authors and hosted elsewhere; dose.wiki does not host or
          license them. For replication media hosted here, see the{" "}
          <Link href="/docs/license#replication-media-terms" className={proseLinkClassName}>
            licensing terms
          </Link>{" "}
          to correct a credit or request removal.
        </p>
      </SectionCard>
    </PublicContentShell>
  );
}
