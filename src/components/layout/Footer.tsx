import Link from "next/link";
import { Icon } from "../common/Icon";
import { SiteLicenceNotice } from "../common/SiteLicenceNotice";
import { SiteSupporter } from "../common/SiteSupporter";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { AppearanceControls } from "@/app/_components/AppearanceControls";
import type { RouteChromeModel } from "@/types/navigation";
import { getRouteChromeModel } from "@/utils/routeChrome";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";

interface FooterProps {
  model?: RouteChromeModel;
}

export function Footer({ model = getRouteChromeModel("/") }: FooterProps) {
  return (
    // `theme-chrome-dark` pins the dark palette on this subtree exactly as it does
    // on the header, so the footer bar stays the same colour in light mode instead
    // of following the page. The island block in site-colors.css excludes Effect
    // Index, which dresses its own footer from `html[data-site="effectindex"]`.
    <footer className="app-footer theme-chrome-dark theme-footer-surface py-6">
      {/* Full-bleed on purpose, unlike the header: no `mx-auto max-w-7xl` here, so the
          disclaimer and the appearance controls sit against the viewport edges rather
          than the page column. The gutter is the only inset. */}
      <div className="flex w-full flex-col gap-4 px-6" data-nosnippet>
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
            {/* Which appearance axes are offered is publication policy, resolved inside
                the group — the route chrome model has no say in it. The pair stacks below
                420px on the same breakpoint this nav flips on, so the disclaimer column
                keeps the width it had when there was one control. */}
            <AppearanceControls className="flex-col min-[420px]:flex-row" />
          </nav>
        </div>
      </div>
    </footer>
  );
}
