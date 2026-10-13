"use client";

import { Icon } from "@/components/common/Icon";
import { TOUCH_PILL } from "@/components/ui/touchTargets";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { buildPiruLogHref, buildPiruOpenHref } from "./piruLinks";

const PIRU_PILL_CLASSNAME = cn(
  "theme-control-pill theme-focus-ring inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
  TOUCH_PILL,
);

/**
 * "Log in Piru" at the end of the Dosage & Duration route row. The link carries
 * the substance and the selected route, so the tab the reader is on is the
 * route Piru stages.
 */
export function PiruLogLink({
  slug,
  routeKey,
  routeLabel,
  className,
}: {
  slug: string;
  routeKey: string;
  /** English route label, translated here like the route tabs translate it. */
  routeLabel: string;
  className?: string;
}) {
  const t = useT();
  return (
    <a
      href={buildPiruLogHref(slug, routeKey)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("Log a dose in Piru: {{route}}", { route: t(routeLabel) })}
      className={cn(PIRU_PILL_CLASSNAME, className)}
    >
      <Icon icon="lucide:notebook-pen" size={14} />
      {t("Log in Piru")}
    </a>
  );
}

/**
 * "Open in Piru" beside the article's alternative names. It opens the
 * substance in Piru, or, without the app, Piru's entry on the About page (see
 * `piruLinks`).
 */
export function PiruOpenChip({ slug }: { slug: string }) {
  const t = useT();
  return (
    <a
      href={buildPiruOpenHref(slug)}
      target="_blank"
      rel="noopener noreferrer"
      className={PIRU_PILL_CLASSNAME}
    >
      <Icon icon="lucide:notebook-pen" size={14} />
      {t("Open in Piru")}
    </a>
  );
}
