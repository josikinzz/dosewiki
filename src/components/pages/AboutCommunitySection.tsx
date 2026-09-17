import { Icon } from "../common/Icon";
import { AppImage } from "../common/AppImage";
import {
  ABOUT_COMMUNITY_LINKS,
  type CommunityLogo,
} from "../../data/content/aboutCommunity";
import { cn } from "@/lib/utils";

/**
 * Eyebrow shared by the About page's grouped lists (contributor roster groups).
 */
export const GROUP_LABEL_CLASSNAME =
  "theme-text-faint text-xs font-bold uppercase tracking-[0.15em]";

/**
 * The squircle logo tile every entry shares. Artwork letterboxes by default;
 * square avatar marks bleed to the edges; wordmarks fit by width.
 */
function LogoTile({ logo }: { logo: CommunityLogo }) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[0.55rem]",
        "theme-community-tile border border-dose-border",
        "transition-[box-shadow,border-color] duration-300",
      )}
    >
      <AppImage
        src={logo.src}
        alt=""
        width={36}
        height={36}
        unoptimized={logo.src.endsWith(".svg")}
        className={cn(
          logo.fit === "cover" && "h-full w-full object-cover",
          logo.fit === "wide" && "h-auto w-[88%] object-contain",
          (logo.fit ?? "contain") === "contain" && "h-6 w-6 object-contain",
        )}
      />
    </span>
  );
}

/**
 * Partners & Community section body (dose.wiki only): one flat, compact
 * two-column roster — logo tile plus name, the whole row an external link.
 * The roster is `content/about/community.json`, typed by
 * `src/data/content/aboutCommunity.ts`; it currently carries no descriptive
 * copy by design.
 */
export function AboutCommunitySection() {
  return (
    <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {ABOUT_COMMUNITY_LINKS.map((entry) => (
        <li key={entry.key}>
          <a
            href={entry.href}
            target="_blank"
            rel="noopener noreferrer"
            className="theme-focus-ring theme-community-node group flex items-center gap-3 rounded-xl py-1"
          >
            <LogoTile logo={entry.logo} />
            <span className="theme-text-primary min-w-0 flex-1 truncate text-sm font-semibold transition-colors group-hover:text-dose-accent">
              {entry.name}
            </span>
            <Icon
              icon="lucide:arrow-up-right"
              className="theme-text-faint h-4 w-4 shrink-0 opacity-0 transition-[opacity,color] duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
