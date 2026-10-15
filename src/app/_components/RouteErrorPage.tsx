"use client";

import Link from "next/link";
import { useEffect } from "react";
import { getStatusRecoveryLink } from "@server/next/statusRecoveryLinks";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { Button } from "@/components/ui/button";
import { msg, useT } from "@/i18n/client";
import { reportClientError } from "@/lib/reportClientError";
import { StatusPageShell } from "./StatusPageShell";

export type RouteErrorRecovery = {
  href: string;
  label: string;
};

type RouteErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
  boundary: string;
  recovery?: RouteErrorRecovery;
};

export function RouteErrorPage({ error, reset, boundary, recovery }: RouteErrorPageProps) {
  const t = useT();
  const target = recovery ?? {
    href: getStatusRecoveryLink("substances").href,
    label: msg("Back to substances"),
  };

  useEffect(() => {
    reportClientError(error, { boundary });
  }, [boundary, error]);

  return (
    <StatusPageShell
      badge={t("Unexpected error")}
      badgeVariant="destructive"
      statusIcon="lucide:triangle-alert"
      statusTone="danger"
      title={t("Something went wrong")}
      description={t(
        "{{siteName}} hit an unexpected issue while loading this page. Retry once, or head back to the public library if the problem persists.",
        { siteName: SITE_FLAVOR_CONFIG.name },
      )}
      actions={
        <>
          <Button type="button" onClick={reset} variant="destructive">
            {t("Retry")}
          </Button>
          <Button asChild variant="outline">
            <Link href={target.href}>{t(target.label)}</Link>
          </Button>
        </>
      }
      minHeightClassName="min-h-[60vh]"
    />
  );
}
