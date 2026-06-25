import type { Metadata } from "next";
import Link from "next/link";
import { buildPageMetadata } from "@server/next/metadata";
import { getStatusRecoveryLink } from "@server/next/statusRedirectPolicy";
import { getPublicHref } from "@/utils/publicHref";
import { Button } from "@/components/ui/button";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { StatusFact, StatusPageShell } from "./_components/StatusPageShell";

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
      complementHeading="Jump back in"
      complementVariant="plain"
      complement={
        <>
          <StatusFact
            tone="plain"
            label="Library"
            value={
              <ul className="space-y-1">
                <li>
                  <Link href={substancesLink.href} className={proseLinkClassName}>
                    {substancesLink.label}
                  </Link>
                </li>
                <li>
                  <Link href={effectsLink.href} className={proseLinkClassName}>
                    {effectsLink.label}
                  </Link>
                </li>
              </ul>
            }
          />
          <StatusFact
            tone="plain"
            label="Find a page"
            value={
              <ul className="space-y-1">
                <li>
                  <Link href={searchHref} className={proseLinkClassName}>
                    Search the site
                  </Link>
                </li>
                <li>
                  <Link href={reportsLink.href} className={proseLinkClassName}>
                    {reportsLink.label}
                  </Link>
                </li>
              </ul>
            }
          />
        </>
      }
      minHeightClassName="min-h-[60vh]"
    />
  );
}
