"use client";

import { useEffect } from "react";
import { attachApprovedAnalytics } from "@server/next/analyticsHostPolicy";

export function ApprovedPublicAnalytics({ host }: { host?: string }) {
  useEffect(() => {
    const script = attachApprovedAnalytics({
      document,
      host: host ?? window.location.host,
    });

    return () => {
      script?.remove();
    };
  }, [host]);

  return null;
}
