"use client";

import { RouteErrorPage } from "../_components/RouteErrorPage";

export default function ReviewError({
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
      boundary="review"
      recovery={{ href: "/review", label: "Back to review" }}
    />
  );
}
