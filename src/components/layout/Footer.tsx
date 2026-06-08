import Link from "next/link";
import { DoseWikiLogo } from "../common/DoseWikiLogo";
import { Icon, type IconName } from "../common/Icon";
import { ThemeToggle } from "@/app/_components/ThemeToggle";
import type { RouteChromeIcon, RouteChromeModel } from "@/types/navigation";
import { getRouteChromeModel } from "@/utils/routeChrome";

const FOOTER_ICONS = {
  about: "lucide:info",
  dev: "lucide:settings",
} satisfies Partial<Record<RouteChromeIcon, IconName>>;

const LIGHT_FROSTED_CONTROL_CLASSES =
  "[html[data-theme='light']_&]:border-transparent [html[data-theme='light']_&]:[background:var(--theme-light-frosted-control-bg)] [html[data-theme='light']_&]:[box-shadow:var(--theme-light-frosted-control-shadow)] [html[data-theme='light']_&]:[--tw-ring-color:var(--theme-light-frosted-control-border)] [html[data-theme='light']_&:hover]:[background:var(--theme-light-frosted-control-hover-bg)] [html[data-theme='light']_&:hover]:[box-shadow:var(--theme-light-frosted-control-hover-shadow)] [html[data-theme='light']_&:focus-visible]:[background:var(--theme-light-frosted-control-hover-bg)] [html[data-theme='light']_&:focus-visible]:[box-shadow:var(--theme-light-frosted-control-hover-shadow)]";

interface FooterProps {
  model?: RouteChromeModel;
}

export function Footer({ model = getRouteChromeModel("/") }: FooterProps) {
  return (
    <footer className="app-footer theme-footer-surface py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4">
        <div className="flex items-start justify-between gap-3 sm:items-center sm:gap-6">
          <div className="flex min-w-0 max-w-3xl items-start gap-3">
            <Link href={model.footerLogo.href} scroll={false} className="group inline-flex shrink-0 self-start">
              <DoseWikiLogo
                alt="dose.wiki logo"
                width={32}
                height={32}
                className="h-8 w-8 opacity-90 transition-opacity group-hover:opacity-100"
                draggable={false}
              />
            </Link>

            <div className="flex min-w-0 flex-col gap-1 leading-tight">
              <Link href={model.footerLogo.href} scroll={false} className="group self-start">
                <span className="theme-text-primary font-display text-base font-semibold tracking-tight transition-colors">
                  dose<span className="theme-accent-heading transition-colors group-hover:text-[color:var(--theme-accent-soft)]">.wiki</span>
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
                  scroll={false}
                  aria-label={item.label}
                  title={item.label}
                  className={`theme-icon-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-transparent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${LIGHT_FROSTED_CONTROL_CLASSES}`}
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
                  className={`theme-icon-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-transparent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${LIGHT_FROSTED_CONTROL_CLASSES}`}
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
