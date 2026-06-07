import Link from "next/link";
import { AppImage } from "../common/AppImage";
import { Icon, type IconName } from "../common/Icon";
import { ThemeToggle } from "@/app/_components/ThemeToggle";
import type { RouteChromeIcon, RouteChromeModel } from "@/types/navigation";
import { getRouteChromeModel } from "@/utils/routeChrome";

const FOOTER_ICONS = {
  about: "lucide:info",
  dev: "lucide:settings",
} satisfies Partial<Record<RouteChromeIcon, IconName>>;

interface FooterProps {
  model?: RouteChromeModel;
}

export function Footer({ model = getRouteChromeModel("/") }: FooterProps) {
  const logoSrc = "/dosewiki-logo.png";

  return (
    <footer className="app-footer theme-footer-surface py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4">
        <div className="flex items-start justify-between gap-3 sm:items-center sm:gap-6">
          <div className="flex min-w-0 max-w-3xl items-start gap-3">
            <Link href={model.footerLogo.href} className="group inline-flex shrink-0 self-start">
              <AppImage
                src={logoSrc}
                alt="dose.wiki logo"
                width={32}
                height={32}
                className="h-8 w-8 opacity-90 transition-opacity group-hover:opacity-100"
                draggable={false}
              />
            </Link>

            <div className="flex min-w-0 flex-col gap-1 leading-tight">
              <Link href={model.footerLogo.href} className="group self-start">
                <span className="theme-accent-heading font-display text-base font-semibold tracking-tight transition-colors group-hover:text-[color:var(--theme-accent-soft)]">
                  dose.wiki
                </span>
              </Link>

              <p className="theme-text-faint text-xs leading-5">
                Community harm-reduction information. Not medical advice. Content is available under the{" "}
                <a
                  href="https://creativecommons.org/licenses/by-sa/4.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="theme-link-muted transition-colors"
                >
                  CC BY-SA 4.0 license
                </a>
                .
              </p>
            </div>
          </div>

          <nav className="theme-text-muted flex shrink-0 flex-col items-end gap-2 text-sm font-medium min-[420px]:flex-row min-[420px]:items-center sm:justify-end">
            {model.footerNavItems.map((item) => {
              const footerIcon = FOOTER_ICONS[item.icon] ?? "lucide:info";

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-label={item.label}
                  title={item.label}
                  className="theme-icon-button inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                >
                  <Icon icon={footerIcon} size={18} />
                </Link>
              );
            })}
            {model.footerExternalNavItems.map((item) => {
              const footerIcon = FOOTER_ICONS[item.icon] ?? "ph:github-logo-bold";

              return (
                <a
                  key={item.id}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={item.label}
                  className="theme-icon-button inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                >
                  <Icon icon={footerIcon} size={18} />
                </a>
              );
            })}
            {model.footerShowsThemeToggle && <ThemeToggle />}
          </nav>
        </div>
      </div>
    </footer>
  );
}
