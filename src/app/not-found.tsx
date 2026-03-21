import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusFact, StatusPageShell } from "./_components/StatusPageShell";

export default function NotFound() {
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
            <Link href="/substances">Browse substances</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/effects">Browse effects</Link>
          </Button>
        </>
      }
      complement={
        <>
          <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.24em]">Quick links</p>
          <StatusFact label="Public index" value={<Link href="/substances" className="theme-link-muted">Substances</Link>} />
          <StatusFact label="Related catalog" value={<Link href="/reports" className="theme-link-muted">Trip reports</Link>} />
        </>
      }
      minHeightClassName="min-h-[60vh]"
    />
  );
}
