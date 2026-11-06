"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

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
    <div className="relative text-center">
      <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.24em]">
        404
      </p>

      <h1 className="font-display mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
        {t(title ?? "Page not found")}
      </h1>

      <p className="theme-text-secondary mx-auto mt-4 max-w-md text-base leading-7">
        {t(body ?? "That page doesn’t exist or may have moved.")}
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        <Button asChild variant="accent" size="lg">
          <Link href={substancesHref}>{t("Browse substances")}</Link>
        </Button>
        <div className="flex items-center gap-x-3 text-sm">
          <Link
            href={effectsHref}
            className="rounded-sm py-1 font-medium text-[var(--theme-accent-strong)] underline decoration-1 underline-offset-4 transition-colors hover:decoration-2 theme-focus-ring"
          >
            {t(effectsLabel)}
          </Link>
          <span aria-hidden="true" className="theme-text-faint">
            &middot;
          </span>
          <Link
            href={reportsHref}
            className="rounded-sm py-1 font-medium text-[var(--theme-accent-strong)] underline decoration-1 underline-offset-4 transition-colors hover:decoration-2 theme-focus-ring"
          >
            {t(reportsLabel)}
          </Link>
        </div>
      </div>
    </div>
  );
}