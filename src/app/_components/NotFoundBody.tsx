"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

/**
 * The 404's on-page chrome, split from the server `not-found.tsx` so the
 * strings render in the mirror's language: the not-found route matches no
 * localized page, so nothing calls `setRequestLocale` above it and the server
 * `t` would stay English. `useT` reads the layout segments, the same root
 * chrome idiom `Footer` and `Header` rely on.
 *
 * The Copy Studio blocks (`not-found-title`, `not-found-body`) arrive as plain
 * strings and win when present; the fallbacks translate when the block is
 * untouched.
 */
export function NotFoundBody({
  substancesHref,
  effectsHref,
  effectsLabel,
  reportsHref,
  reportsLabel,
  title,
  body,
}: {
  substancesHref: string;
  effectsHref: string;
  effectsLabel: string;
  reportsHref: string;
  reportsLabel: string;
  title?: string;
  body?: string;
}) {
  const t = useT();

  return (
    <div className="relative">
      <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.24em]">
        404
      </p>

      <h1 className="font-display mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
        {t(title ?? "Page not found")}
      </h1>

      <p className="theme-text-secondary mt-4 max-w-md text-base leading-7">
        {t(body ?? "That page doesn’t exist or may have moved.")}
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button asChild variant="accent" size="lg">
          <Link href={substancesHref}>{t("Browse substances")}</Link>
        </Button>
        <div className="flex items-center gap-x-3 text-sm">
          <Link
            href={effectsHref}
            className="theme-text-muted rounded-sm py-1 underline-offset-4 transition-colors hover:text-dose-text hover:underline theme-focus-ring"
          >
            {t(effectsLabel)}
          </Link>
          <span aria-hidden="true" className="theme-text-faint">
            &middot;
          </span>
          <Link
            href={reportsHref}
            className="theme-text-muted rounded-sm py-1 underline-offset-4 transition-colors hover:text-dose-text hover:underline theme-focus-ring"
          >
            {t(reportsLabel)}
          </Link>
        </div>
      </div>
    </div>
  );
}