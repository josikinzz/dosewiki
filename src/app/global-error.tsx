"use client";

import { GlobalErrorDocument } from "./_components/GlobalErrorDocument";
// The root layout's sheets unmount with it; the replacement document brings its own.
import "@site-styles";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <GlobalErrorDocument error={error} reset={reset} />;
}
