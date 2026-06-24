import type { Metadata } from "next";
import Link from "next/link";
import { buildPageMetadata } from "@server/next/metadata";
import { getStatusRecoveryLink } from "@server/next/statusRedirectPolicy";
import { getPublicHref } from "@/utils/publicHref";
import { Button } from "@/components/ui/button";
import { StatusPageShell } from "./_components/StatusPageShell";

export const metadata: Metadata = buildPageMetadata({
  title: "Page not found",
  description: "The page you requested does not exist or may have moved.",
  pathname: "/404",
  noIndex: true,
});

export default function NotFound() {
  const substancesLink = getStatusRecoveryLink("substances");
  const effectsLink = getStatusRecoveryLink("effects");
  const reportsLink = getStatusRecoveryLink("reports");
  const searchHref = getPublicHref({ type: "search" });

  return (
    <StatusPageShell
      badge="404"
      badgeVariant="secondary"
      statusIcon="lucide:compass"
      statusTone="neutral"
      title="Page not found"
      description="The page you requested does not exist or may have moved. If you were after a specific substance or effect, search for it below; otherwise pick up where you left off from the library."
      actions={
        <>
          <Button asChild>
            <Link href={substancesLink.href}>Browse substances</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href={effectsLink.href}>Browse effects</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href={searchHref}>Search the site</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href={reportsLink.href}>{reportsLink.label}</Link>
          </Button>
        </>
      }
      minHeightClassName="min-h-[60vh]"
    />
  );
}
