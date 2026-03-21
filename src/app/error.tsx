"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusPageShell } from "./_components/StatusPageShell";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <StatusPageShell
      badge="Unexpected error"
      badgeVariant="destructive"
      statusIcon="lucide:triangle-alert"
      statusTone="danger"
      title="Something went wrong"
      description="dose.wiki hit an unexpected issue while loading this page. Retry once, or head back to the public library if the problem persists."
      actions={
        <>
          <Button type="button" onClick={reset} variant="destructive">
            Retry
          </Button>
          <Button asChild variant="outline">
            <Link href="/substances">Back to substances</Link>
          </Button>
        </>
      }
      minHeightClassName="min-h-[60vh]"
    />
  );
}
