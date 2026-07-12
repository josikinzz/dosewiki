"use client";

import { useEffect } from "react";
import { attachApprovedAnalytics } from "@server/next/analyticsHostPolicy";

export function ApprovedPublicAnalytics({ host, nonce }: { host?: string; nonce?: string }) {
  useEffect(() => {
    const script = attachApprovedAnalytics({
      document,
      host: host ?? window.location.host,
      nonce,
    });

    return () => {
      script?.remove();
    };
  }, [host, nonce]);

  return null;
}
