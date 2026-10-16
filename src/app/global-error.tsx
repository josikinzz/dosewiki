"use client";

import { GlobalErrorDocument } from "./_components/GlobalErrorDocument";
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
