import { SmartLink } from "../common/SmartLink";
import { Icon } from "../common/Icon";
import { SiteLicenceNotice } from "../common/SiteLicenceNotice";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import type { RouteChromeModel } from "@/types/navigation";
import { getRouteChromeModel } from "@/utils/routeChrome";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";
import { useT } from "@/i18n/client";

interface FooterProps {
  model?: RouteChromeModel;
}

export function Footer({ model = getRouteChromeModel("/") }: FooterProps) {
  const t = useT();

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
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          {/* No brand mark here. The header already carries the logo and wordmark on every
              page that renders this footer, so repeating them below the fold was pure echo;
              the footer's job is the disclaimer and the reuse terms. */}
          <div className="flex min-w-0 max-w-prose flex-col">
            {t(SITE_FLAVOR_CONFIG.footer.tagline)
              .split("\n\n")
              .map((paragraph, index) => (
                <p
                  key={index}
                  className="theme-text-faint text-xs leading-5 [&+&]:mt-2"
                >
                  {paragraph}
                </p>
              ))}

            <SiteLicenceNotice className="theme-text-faint text-xs leading-5 mt-4" />
          </div>

          {/* Right rail: the appearance/nav controls. */}
          <div className="flex w-full items-end justify-between gap-4 sm:w-auto sm:shrink-0 sm:flex-col sm:items-end">
            <nav className="theme-text-muted flex items-center gap-2 text-sm font-medium">
            {model.footerNavItems.map((item) => {
              const footerIcon = resolveRouteChromeIcon(item.icon);

              return (
                <SmartLink
                  key={item.id}
                  href={item.href}
                  scroll={false}
                  aria-label={t(item.label)}
                  title={t(item.label)}
                  className="theme-icon-button theme-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-full border border-transparent transition-colors"
                >
                  <Icon icon={footerIcon} size={18} />
                </SmartLink>
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
                  aria-label={t(item.label)}
                  className="theme-icon-button theme-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-full border border-transparent transition-colors"
                >
                  <Icon icon={footerIcon} size={18} />
                </a>
              );
            })}
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}
