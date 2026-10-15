import { SmartLink } from "../common/SmartLink";
import { Icon } from "../common/Icon";
import { SiteLicenceNotice } from "../common/SiteLicenceNotice";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import type { RouteChromeModel } from "@/types/navigation";
import { getRouteChromeModel } from "@/utils/routeChrome";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";
import { useT } from "@/i18n/client";

const FOOTER_ICON_LINK_CLASS =
  "theme-icon-button theme-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-full border border-transparent transition-colors";

interface FooterProps {
  model?: RouteChromeModel;
}

export function Footer({ model = getRouteChromeModel("/") }: FooterProps) {
  const t = useT();

  return (
    <footer className="app-footer theme-chrome-dark theme-footer-surface py-6">
      <div className="flex w-full flex-col gap-4 px-4 min-[1600px]:px-6" data-nosnippet>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
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

          <div className="flex w-full items-end justify-between gap-4 sm:w-auto sm:shrink-0 sm:flex-col sm:items-end">
            <nav className="theme-text-muted flex items-center gap-2">
            {model.footerNavItems.map((item) => {
              const footerIcon = resolveRouteChromeIcon(item.icon);

              return (
                <SmartLink
                  key={item.id}
                  href={item.href}
                  scroll={false}
                  aria-label={t(item.label)}
                  title={t(item.label)}
                  className={FOOTER_ICON_LINK_CLASS}
                >
                  <Icon icon={footerIcon} size={20} />
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
                  className={FOOTER_ICON_LINK_CLASS}
                >
                  <Icon icon={footerIcon} size={20} />
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
