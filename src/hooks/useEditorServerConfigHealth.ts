"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type EditorServerConfigHealth = {
  status: "idle" | "checking" | "healthy" | "unhealthy" | "error";
  canSaveToPostgres: boolean;
  issues: string[];
  summary: string;
  checkedAt: string | null;
  isRefreshing: boolean;
};

const idleHealthState: EditorServerConfigHealth = {
  status: "idle",
  canSaveToPostgres: false,
  issues: [],
  summary: "",
  checkedAt: null,
  isRefreshing: false,
};

function summarizeIssues(canSaveToPostgres: boolean, issues: string[]): string {
  if (canSaveToPostgres) {
    return "Server ready";
  }

  if (issues.some((issue) => issue.includes("credential probe"))) {
    return "Credential check failed";
  }

  if (issues.some((issue) => issue.includes("DATA_ADMIN_KEY"))) {
    return "Missing admin key";
  }

  if (issues.some((issue) => issue.includes("Postgres URL"))) {
    return "Missing Postgres URL";
  }

  return issues[0] ?? "Server issue";
}

// Skip focus-triggered rechecks when the last check is this recent, so tab
// switching does not hammer the rate-limited diagnostics endpoint.
const FOCUS_REFRESH_MIN_INTERVAL_MS = 15_000;

export function useEditorServerConfigHealth(enabled: boolean) {
  const [health, setHealth] = useState<EditorServerConfigHealth>(idleHealthState);
  const lastAttemptAtRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setHealth(idleHealthState);
      return;
    }

    lastAttemptAtRef.current = Date.now();

    setHealth((current) => ({
      ...current,
      status: current.status === "idle" ? "checking" : current.status,
      summary: current.status === "idle" ? "Checking server" : current.summary,
      isRefreshing: true,
    }));

    try {
      const response = await fetch("/api/editor-config-health", {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 429) {
          // Our own polling got throttled; keep the last known status instead
          // of alarming the editor. The next interval tick rechecks.
          setHealth((current) => ({ ...current, isRefreshing: false }));
          return;
        }

        const message =
          typeof result.error === "string" ? result.error : "Unable to check editor server config.";

        setHealth({
          status: "error",
          canSaveToPostgres: false,
          issues: [message],
          summary: "Check failed",
          checkedAt: null,
          isRefreshing: false,
        });
        return;
      }

      const issues = Array.isArray(result.issues)
        ? result.issues.filter((value): value is string => typeof value === "string")
        : [];
      const canSaveToPostgres = result.canSaveToPostgres === true;

      setHealth({
        status: canSaveToPostgres ? "healthy" : "unhealthy",
        canSaveToPostgres,
        issues,
        summary: summarizeIssues(canSaveToPostgres, issues),
        checkedAt: typeof result.checkedAt === "string" ? result.checkedAt : null,
        isRefreshing: false,
      });
    } catch {
      setHealth({
        status: "error",
        canSaveToPostgres: false,
        issues: ["Unable to reach the editor health check."],
        summary: "Check failed",
        checkedAt: null,
        isRefreshing: false,
      });
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setHealth(idleHealthState);
      return;
    }

    void refresh();

    const intervalId = window.setInterval(() => {
      void refresh();
    }, 60_000);

    const handleFocus = () => {
      if (Date.now() - lastAttemptAtRef.current < FOCUS_REFRESH_MIN_INTERVAL_MS) {
        return;
      }
      void refresh();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [enabled, refresh]);

  return {
    health,
    refresh,
  };
}
