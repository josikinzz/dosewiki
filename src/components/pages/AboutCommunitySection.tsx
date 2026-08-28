import { Icon } from "../common/Icon";
import { AppImage } from "../common/AppImage";
import { PublicPill } from "@/components/common/PublicTokens";
import { InteractiveContentCard } from "@/components/ui/surface";
import {
  ABOUT_COMMUNITY_DATA_PARTNERS,
  ABOUT_COMMUNITY_FRIENDS,
  ABOUT_COMMUNITY_SISTERS,
  type CommunityLink,
  type CommunityLogo,
} from "../../data/content/aboutCommunity";
import { cn } from "@/lib/utils";

/**
 * Eyebrow shared by the About page's grouped lists (contributor roster groups
 * and the community tiers below).
 */
export const GROUP_LABEL_CLASSNAME =
  "theme-text-faint text-xs font-bold uppercase tracking-[0.15em]";

/** Blurbs keyed by copy-block key, resolved by the route from the copy CMS. */
export type AboutCommunityBlurbs = Record<string, string>;

interface AboutCommunitySectionProps {
  blurbs: AboutCommunityBlurbs;
}

/**
 * The squircle logo tile every entry shares. Image logos letterbox by default;
 * square app-icon artwork bleeds to the edges; wordmarks fit by width.
 * Subreddits render an `r/` monogram (Reddit serves no anonymous icon).
 */
function LogoTile({ logo, className }: { logo: CommunityLogo; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[0.65rem]",
        "theme-community-tile border border-dose-border",
        className,
      )}
    >
      {logo.kind === "monogram" ? (
        <span className="font-display text-lg font-bold tracking-tight text-dose-accent-soft">
          {logo.text}
        </span>
      ) : (
        <AppImage
          src={logo.src}
          alt=""
          width={44}
          height={44}
          unoptimized={logo.src.endsWith(".svg")}
          className={cn(
            logo.fit === "cover" && "h-full w-full object-cover",
            logo.fit === "wide" && "h-auto w-[88%] object-contain",
            (logo.fit ?? "contain") === "contain" && "h-7 w-7 object-contain",
          )}
        />
      )}
    </span>
  );
}


/** A partner card; the whole surface is the external link. */
function CommunityCard({
  entry,
  blurb,
  dataTag,
}: {
  entry: CommunityLink;
  blurb: string;
  dataTag?: string;
}) {
  return (
    <InteractiveContentCard asChild padding="md" className="group h-full">
      <a
        href={entry.href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start gap-3.5"
      >
        <LogoTile logo={entry.logo} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="theme-text-primary text-sm font-semibold">{entry.name}</span>
            {dataTag ? (
              <PublicPill tone="accent" size="sm">
                {dataTag}
              </PublicPill>
            ) : (
              <span className="theme-text-ghost text-xs">{entry.domain}</span>
            )}
          </span>
          <span className="theme-text-faint mt-1 block text-sm leading-6">{blurb}</span>
        </span>
        <Icon
          icon="lucide:arrow-up-right"
          className="theme-text-faint h-4 w-4 shrink-0 translate-y-1 opacity-0 transition-[opacity,translate,color] duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
        />
      </a>
    </InteractiveContentCard>
  );
}

/**
 * Partners & Community section body (dose.wiki only): sister projects, data
 * partners, and community neighbours as equal-weight cards. Structure lives in
 * `src/data/content/aboutCommunity.ts`; blurbs are `about-community-*` copy
 * blocks.
 */
export function AboutCommunitySection({ blurbs }: AboutCommunitySectionProps) {
  const blurb = (key: string) => blurbs[key] ?? "";

  return (
    <div className="space-y-8">

      <div className="space-y-3">
        <span className={GROUP_LABEL_CLASSNAME}>Sister projects</span>
        <ul className="grid gap-4 sm:grid-cols-2">
          {ABOUT_COMMUNITY_SISTERS.map((entry) => (
            <li key={entry.key}>
              <CommunityCard entry={entry} blurb={blurb(entry.copyKey)} />
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <span className={GROUP_LABEL_CLASSNAME}>Data partners</span>
        <ul className="grid gap-4 sm:grid-cols-2">
          {ABOUT_COMMUNITY_DATA_PARTNERS.map((entry) => (
            <li key={entry.key}>
              <CommunityCard
                entry={entry}
                blurb={blurb(entry.copyKey)}
                dataTag={entry.dataTag}
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <span className={GROUP_LABEL_CLASSNAME}>Friends &amp; community</span>
        <ul className="grid gap-4 sm:grid-cols-2">
          {ABOUT_COMMUNITY_FRIENDS.map((entry) => (
            <li key={entry.key}>
              <CommunityCard entry={entry} blurb={blurb(entry.copyKey)} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
