import { Icon } from "../common/Icon";
import { AppImage } from "../common/AppImage";
import { PublicPill } from "@/components/common/PublicTokens";
import {
  ABOUT_COMMUNITY_DATA_PARTNERS,
  ABOUT_COMMUNITY_FRIENDS,
  type CommunityLink,
  type CommunityLogo,
} from "../../data/content/aboutCommunity";
import { cn } from "@/lib/utils";

/**
 * Eyebrow shared by the About page's contributor roster and community tiers.
 */
export const GROUP_LABEL_CLASSNAME =
  "theme-text-faint text-xs font-bold uppercase tracking-[0.15em]";

/** Blurbs keyed by copy-block key, resolved by the route from the copy CMS. */
export type AboutCommunityBlurbs = Record<string, string>;

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


/** A partner row; the whole row is the external link. No card surface. */
function CommunityRow({
  entry,
  blurb,
  dataTag,
}: {
  entry: CommunityLink;
  blurb: string;
  dataTag?: string;
}) {
  return (
    <a
      href={entry.href}
      target="_blank"
      rel="noopener noreferrer"
      className="theme-focus-ring theme-community-node group flex items-start gap-3.5 rounded-xl"
    >
      <LogoTile logo={entry.logo} className="transition-[box-shadow,border-color] duration-300" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="theme-text-primary text-sm font-semibold transition-colors group-hover:text-dose-accent">
            {entry.name}
          </span>
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
  );
}

/**
 * Partners & Community section body (dose.wiki only): data partners (including
 * the Consciousness Library, which runs on the dose.wiki API) and neighbouring
 * communities as plain rows. Structure lives in
 * `src/data/content/aboutCommunity.ts`; blurbs are `about-community-*` copy
 * blocks.
 */
export function AboutCommunitySection({ blurbs }: { blurbs: AboutCommunityBlurbs }) {
  const blurb = (key: string) => blurbs[key] ?? "";

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <span className={GROUP_LABEL_CLASSNAME}>Data partners</span>
        <ul className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {ABOUT_COMMUNITY_DATA_PARTNERS.map((entry) => (
            <li key={entry.key}>
              <CommunityRow entry={entry} blurb={blurb(entry.copyKey)} dataTag={entry.dataTag} />
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-4">
        <span className={GROUP_LABEL_CLASSNAME}>Friends &amp; community</span>
        <ul className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          {ABOUT_COMMUNITY_FRIENDS.map((entry) => (
            <li key={entry.key}>
              <CommunityRow entry={entry} blurb={blurb(entry.copyKey)} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
