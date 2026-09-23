"use client";

import { msg } from "@/i18n/client";
import { publicHref } from "@/utils/publicHref";
import { RouteErrorPage } from "../_components/RouteErrorPage";

export default function ReplicationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorPage
      error={error}
      reset={reset}
      boundary="replications"
      recovery={{ href: publicHref.replications(), label: msg("Back to replications") }}
    />
  );
}
