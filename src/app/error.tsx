"use client";

import Link from "next/link";
import { getStatusRecoveryLink } from "@server/next/statusRecoveryLinks";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { Button } from "@/components/ui/button";
import { StatusPageShell } from "./_components/StatusPageShell";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const substancesLink = getStatusRecoveryLink("substances");

  return (
    <StatusPageShell
      badge="Unexpected error"
      badgeVariant="destructive"
      statusIcon="lucide:triangle-alert"
      statusTone="danger"
      title="Something went wrong"
      description={`${SITE_FLAVOR_CONFIG.name} hit an unexpected issue while loading this page. Retry once, or head back to the public library if the problem persists.`}
      actions={
        <>
          <Button type="button" onClick={reset} variant="destructive">
            Retry
          </Button>
          <Button asChild variant="outline">
            <Link href={substancesLink.href}>Back to substances</Link>
          </Button>
        </>
      }
      minHeightClassName="min-h-[60vh]"
    />
  );
}
