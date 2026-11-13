"use client";

import { Icon } from "@/components/common/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TOUCH_PILL } from "@/components/ui/touchTargets";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { journalAppsById, type JournalAppId } from "./journalApps";

export function JournalLogMenu({
  slug,
  appIds,
  routeKey,
  routeLabel,
  className,
}: {
  slug: string;
  appIds: readonly JournalAppId[];
  routeKey: string;
  routeLabel: string;
  className?: string;
}) {
  const t = useT();
  const apps = journalAppsById(appIds);
  if (apps.length === 0) return null;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={t("Log a dose: {{route}}", { route: t(routeLabel) })}
        className={cn(
          "theme-text-muted theme-focus-ring inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors hover:text-dose-text data-[state=open]:text-dose-text",
          TOUCH_PILL,
          className,
        )}
      >
        <Icon icon="lucide:notebook-pen" size={14} />
        {t("Log dose")}
        <Icon icon="lucide:chevron-down" size={12} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel className="theme-text-muted text-xs font-normal">
          {t("Log in a journal app")}
        </DropdownMenuLabel>
        {apps.map((app) => (
          <DropdownMenuItem key={app.id} asChild>
            <a
              href={app.buildLogHref(slug, routeKey)}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-9"
            >
              <span className="font-medium">{app.name}</span>
              <span className="theme-text-muted ml-auto text-xs">
                {app.host}
              </span>
              <Icon icon="lucide:external-link" size={14} />
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
