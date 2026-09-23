"use client";

import { RouteErrorPage } from "../_components/RouteErrorPage";

// Editor surfaces are English-only, so the recovery label carries no `msg()`
// marker and stays out of the public catalog. This module is public-safe: the
// public build compiles it even though every /dev page there is a 404.
export default function DevError({
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
      boundary="dev"
      recovery={{ href: "/dev", label: "Back to Dev Tools" }}
    />
  );
}
