"use client";

import { RouteErrorPage } from "./_components/RouteErrorPage";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorPage error={error} reset={reset} boundary="root" />;
}
