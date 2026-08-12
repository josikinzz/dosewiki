import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@/components/common/Icon";
import { SectionCard } from "@/components/common/SectionCard";
import { InteractiveContentCard } from "@/components/ui/surface";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getCopy } from "@server/next/copyBlocks";

// This page holds no data of its own, but its prose is now editable copy, which
// is a Convex read. It follows the other index pages onto the hourly ISR window
// rather than being fully static; a Copy Studio save revalidates it immediately
// through the shared copy cache tag.
export const revalidate = 3600;

const INTRO =
  "Replications are image, video, and audio recreations of the sensory experiences produced by " +
  "various subjective effects that a user may encounter under the influence of hallucinogens. " +
  "Replications may be created intentionally or unintentionally, as long as they accurately convey " +
  "the effect being shown. They serve the purpose of documenting certain experiences in a level of " +
  "detail that descriptive language is incapable of describing.";

/**
 * The four destinations the old Effect Index navigation offered under Replications. The
 * gallery is a tab on /effects rather than a route of its own, so it is linked by fragment
 * — see `parseTabIdFromHash` in the effects index config.
 */
const DESTINATIONS = [
  {
    href: "/effects#gallery",
    external: false,
    // Shared with the header/footer chrome and the homepage quick link — one source of truth.
    icon: resolveRouteChromeIcon("replications"),
    copyKey: "gallery",
    title: "Gallery",
    description: "Browse image and video replications alongside the effects they recreate.",
  },
  {
    href: "/replications/audio",
    external: false,
    icon: "lucide:audio-lines",
    copyKey: "audio",
    title: "Audio",
    description: "Audio recreations of what a subjective effect sounds like.",
  },
  {
    href: "/replications/tutorials",
    external: false,
    icon: "lucide:list",
    copyKey: "tutorials",
    title: "Tutorials",
    description: "Guides and resources for replicating specific subjective effects.",
  },
  {
    href: "https://www.reddit.com/r/replications",
    external: true,
    icon: "ph:reddit-logo-bold",
    copyKey: "subreddit",
    title: "r/replications",
    description: "The community where replications are shared, critiqued and requested.",
  },
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const copy = await getCopy();

  return buildPublicPageMetadata({
    title: `Replications | ${SITE_FLAVOR_CONFIG.name}`,
    description:
      copy.text("seo-replications-description") ||
      "Image, video, and audio recreations of the sensory experiences produced by subjective effects.",
    route: { family: "replications" },
  });
}

export default async function ReplicationsPage() {
  const copy = await getCopy();
  const cardCopy = (key: string, field: "title" | "description", fallback: string) =>
    copy.text(`replications-card-${key}-${field}`) || fallback;

  return (
    <PublicContentShell width="narrow" focusTarget>
      <PageHeader
        title="Replications"
        icon={resolveRouteChromeIcon("replications")}
        prominentMobileIcon
      />

      <SectionCard>
        <p className="theme-text-secondary text-[1.0625rem] leading-7">
          {copy.text("replications-intro") || INTRO}
        </p>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {DESTINATIONS.map((destination) => (
            <li key={destination.href}>
              <InteractiveContentCard
                asChild
                padding="md"
                className="group flex h-full flex-col gap-2"
              >
                {destination.external ? (
                  <a href={destination.href} target="_blank" rel="noopener noreferrer">
                    <span className="theme-accent-heading flex items-center gap-2 font-medium">
                      <Icon icon={destination.icon} size={18} />
                      {cardCopy(destination.copyKey, "title", destination.title)}
                    </span>
                    <span className="theme-text-faint text-sm leading-6">
                      {cardCopy(destination.copyKey, "description", destination.description)}
                    </span>
                  </a>
                ) : (
                  <Link href={destination.href}>
                    <span className="theme-accent-heading flex items-center gap-2 font-medium">
                      <Icon icon={destination.icon} size={18} />
                      {cardCopy(destination.copyKey, "title", destination.title)}
                    </span>
                    <span className="theme-text-faint text-sm leading-6">
                      {cardCopy(destination.copyKey, "description", destination.description)}
                    </span>
                  </Link>
                )}
              </InteractiveContentCard>
            </li>
          ))}
        </ul>
      </SectionCard>
    </PublicContentShell>
  );
}
