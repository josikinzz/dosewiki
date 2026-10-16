"use client";

import { RouteErrorPage } from "../_components/RouteErrorPage";

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
