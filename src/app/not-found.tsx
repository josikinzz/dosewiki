import Link from "next/link";
import { getStatusRecoveryLink } from "@server/next/statusRedirectPolicy";
import { Button } from "@/components/ui/button";
import { StatusFact, StatusPageShell } from "./_components/StatusPageShell";

export default function NotFound() {
  const substancesLink = getStatusRecoveryLink("substances");
  const effectsLink = getStatusRecoveryLink("effects");
  const reportsLink = getStatusRecoveryLink("reports");

  return (
    <StatusPageShell
      badge="404"
      badgeVariant="secondary"
      statusIcon="lucide:compass"
      statusTone="neutral"
      title="Page not found"
      description="The page you requested does not exist or may have moved. The quickest recovery path is usually the substance index, effects catalog, or trip reports library."
      actions={
        <>
          <Button asChild>
            <Link href={substancesLink.href}>Browse substances</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={effectsLink.href}>Browse effects</Link>
          </Button>
        </>
      }
      complement={
        <>
          <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.24em]">Quick links</p>
          <StatusFact
            label="Public index"
            value={
              <Link href={substancesLink.href} className="theme-link-muted">
                {substancesLink.label}
              </Link>
            }
          />
          <StatusFact
            label="Related catalog"
            value={
              <Link href={reportsLink.href} className="theme-link-muted">
                {reportsLink.label}
              </Link>
            }
          />
        </>
      }
      minHeightClassName="min-h-[60vh]"
    />
  );
}
