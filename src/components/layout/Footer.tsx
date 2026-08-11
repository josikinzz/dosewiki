import Link from "next/link";
import { Icon } from "../common/Icon";
import { SiteLicenceNotice } from "../common/SiteLicenceNotice";
import { SiteSupporter } from "../common/SiteSupporter";
import { SITE_FLAVOR_CONFIG, isEffectIndex } from "@/config/siteFlavor";
import { PaletteLabTrigger } from "@/features/theme-lab";
import { ThemeToggle } from "@/app/_components/ThemeToggle";
import type { RouteChromeModel } from "@/types/navigation";
import { getRouteChromeModel } from "@/utils/routeChrome";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";

interface FooterProps {
  model?: RouteChromeModel;
  /**
   * Whether the Theme Lab trigger mounts. Off on Effect Index: the lab writes
   * `html[data-theme="…"]` overrides, which lose to the site-scoped skin, so the tool
   * would appear broken. Defaults to the ambient flavor; a parameter so tests need no env.
   */
  showPaletteLabTrigger?: boolean;
}

export function Footer({
  model = getRouteChromeModel("/"),
  showPaletteLabTrigger = !isEffectIndex(),
}: FooterProps) {
  return (
    <footer className="app-footer theme-footer-surface py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4" data-nosnippet>
        <div className="flex items-start justify-between gap-3 sm:items-center sm:gap-6">
          {/* No brand mark here. The header already carries the logo and wordmark on every
              page that renders this footer, so repeating them below the fold was pure echo;
              the footer's job is the disclaimer, the reuse terms, and the supporter credit. */}
          <div className="flex min-w-0 max-w-3xl flex-col gap-1 leading-tight">
            <p className="theme-text-faint text-xs leading-5">
              {SITE_FLAVOR_CONFIG.footer.tagline}
            </p>

            <SiteLicenceNotice />

            <SiteSupporter className="mt-1.5" />
          </div>

          <nav className="theme-text-muted flex shrink-0 flex-col items-end gap-2 text-sm font-medium min-[420px]:flex-row min-[420px]:items-center sm:justify-end">
            {model.footerNavItems.map((item) => {
              const footerIcon = resolveRouteChromeIcon(item.icon);

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  scroll={false}
                  aria-label={item.label}
                  title={item.label}
                  className="theme-icon-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-transparent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                >
                  <Icon icon={footerIcon} size={18} />
                </Link>
              );
            })}
            {model.footerExternalNavItems.map((item) => {
              const footerIcon = resolveRouteChromeIcon(item.icon);

              return (
                <a
                  key={item.id}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={item.label}
                  className="theme-icon-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-transparent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                >
                  <Icon icon={footerIcon} size={18} />
                </a>
              );
            })}
            {showPaletteLabTrigger && <PaletteLabTrigger />}
            {model.footerShowsThemeToggle && <ThemeToggle />}
          </nav>
        </div>
      </div>
    </footer>
  );
}
