import { SmartLink } from "@/components/common/SmartLink";
import { DoseWikiLogo } from "@/components/common/DoseWikiLogo";
import { Icon } from "@/components/common/Icon";
import { SiteVersionBadge } from "@/components/common/SiteVersionBadge";
import { SiteWordmark } from "@/components/common/SiteWordmark";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { ConstructionHomeHeader } from "./ConstructionHomeHeader";
import { ConstructionHomeInteractionProvider } from "./ConstructionHomeInteractions";
import { ConstructionHomeNav } from "./ConstructionHomeNav";
import { HomeMailingListCorner } from "./HomeMailingListCorner";
import { homeTileGlyphStyle } from "./homeTileGlyph";
import { partitionQuickLinkRows, type HomeQuickLink } from "./homeQuickLinks";

interface HomeExperienceProps {
  quickLinks: readonly HomeQuickLink[];
  isConstructionMode?: boolean;
  /** Editable hero copy resolved on the server, with the shipped flavor copy as fallback. */
  copy?: {
    tagline?: string;
  };
}

export function HomeExperience({
  quickLinks,
  isConstructionMode = false,
  copy,
}: HomeExperienceProps) {
  const content = (
    <>
      {isConstructionMode ? <ConstructionHomeHeader quickLinks={quickLinks} /> : null}

      <main
        id="main-content"
        tabIndex={-1}
        className="theme-page-shell theme-home-shell relative isolate grid min-h-[calc(100vh-var(--theme-header-height,4.25rem))] overflow-hidden px-4 text-center focus:outline-none supports-[height:100svh]:min-h-[calc(100svh-var(--theme-header-height,4.25rem))] supports-[height:100dvh]:min-h-[calc(100dvh-var(--theme-header-height,4.25rem))] sm:px-6 lg:px-8"
      >
        <div aria-hidden="true" className="theme-home-ambient absolute inset-0 -z-20" />

        <section className="theme-home-stage mx-auto flex w-full max-w-5xl flex-col items-center transition-[max-width,padding,transform] duration-300 ease-out">
          <div className="theme-home-brand-lockup flex flex-col items-center justify-center gap-3 transition-[gap,opacity,transform] duration-300 ease-out sm:gap-4">
            <span className="theme-home-logo-frame inline-flex items-center justify-center">
              <DoseWikiLogo
                alt={SITE_FLAVOR_CONFIG.logo.heroAlt}
                width={204}
                height={195}
                className="theme-home-logo theme-home-logo-main h-32 w-32 transition-[height,width,filter,transform] duration-300 ease-out sm:h-36 sm:w-36 md:h-44 md:w-44"
              />
            </span>
            <h1 className="theme-home-wordmark theme-text-primary relative font-display text-[clamp(3.15rem,7vw,5.75rem)] font-semibold leading-none tracking-normal transition-[opacity,transform] duration-200">
              <SiteWordmark />
              <span className="absolute left-full top-[0.06em] ml-[0.14em] inline-flex whitespace-nowrap">
                <SiteVersionBadge variant="hero" />
              </span>
            </h1>
          </div>

          <p className="theme-home-intro theme-text-secondary mt-4 max-w-2xl text-balance text-base leading-snug transition-[opacity,transform,max-height,margin] duration-300 sm:text-lg md:text-xl">
            {copy?.tagline || SITE_FLAVOR_CONFIG.description}
          </p>

          {isConstructionMode ? (
            <ConstructionHomeNav quickLinks={quickLinks} />
          ) : (
            <nav
              aria-label="App sections"
              className="theme-home-nav mt-9 flex flex-col items-center gap-6 transition-[bottom,gap,margin,opacity,transform] duration-300 lg:flex-row lg:justify-center lg:gap-10"
            >
              {partitionQuickLinkRows(quickLinks).map((row) => (
                <div
                  key={row[0].href}
                  className="theme-home-nav-row flex justify-center gap-5 sm:gap-8 lg:contents"
                >
                  {row.map((item) => (
                    <SmartLink
                      key={item.href}
                      href={item.href}
                      eager
                      className="theme-home-nav-link group flex w-24 flex-col items-center gap-2.5 transition-[color,width,gap,transform] duration-300 theme-focus-ring sm:w-28"
                    >
                      <span
                        className="theme-home-nav-icon theme-public-card-hover-quiet relative flex h-20 w-20 items-center justify-center rounded-2xl border transition-[height,width,border-color,background-color,box-shadow,transform] duration-300 sm:h-[5.75rem] sm:w-[5.75rem]"
                        style={homeTileGlyphStyle(item.icon)}
                      >
                        <Icon icon={item.icon} size={44} className="theme-home-nav-svg transition-[height,width,transform] duration-300" />
                      </span>
                      <span className="theme-home-nav-label font-display text-lg font-semibold leading-none tracking-normal transition-[opacity,max-width] duration-200">
                        {item.label}
                      </span>
                    </SmartLink>
                  ))}
                </div>
              ))}
            </nav>
          )}
        </section>

        <HomeMailingListCorner />
      </main>
    </>
  );

  return isConstructionMode ? (
    <ConstructionHomeInteractionProvider>{content}</ConstructionHomeInteractionProvider>
  ) : content;
}
