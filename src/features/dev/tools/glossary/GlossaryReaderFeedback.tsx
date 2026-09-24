"use client";
import { useEffect, useMemo, useState } from "react";
import {
  FeedbackReviewQueue,
  type FeedbackQueueFilter,
} from "../feedback/FeedbackReviewQueue";
import { glossaryFeedbackAdapter } from "../feedback/glossaryFeedbackAdapter";
import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Button } from "@/components/ui/button";
import { WorkbenchDrawer } from "./WorkbenchDrawer";
import type { LanguageRelease } from "@server/translation/languageReadiness";

type ReactionTotals = {
  term: string;
  target: string;
  version: string;
  right: number;
  improve: number;
};
export function GlossaryReaderFeedback({ locale }: { locale: string }) {
  return (
    <WorkbenchDrawer title="Reader feedback and website readiness">
      <ReviewContent key={locale} locale={locale} />
    </WorkbenchDrawer>
  );
}
function ReviewContent({ locale }: { locale: string }) {
  const [statusFilter, setStatusFilter] = useState<FeedbackQueueFilter | null>(
    null,
  );
  const adapter = useMemo(() => glossaryFeedbackAdapter(locale), [locale]);
  const [data, setData] = useState<{
    totals: ReactionTotals[];
    readiness: { state: string; stale: boolean; revision: string } | null;
    evidence: LanguageRelease | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(
      ["/api/glossary-feedback/reactions", "/api/dev/glossary-readiness"].map(
        async (path) => {
          const response = await fetch(
            `${path}?locale=${encodeURIComponent(locale)}`,
            { signal: controller.signal, cache: "no-store" },
          );
          const body = await response.json();
          if (!response.ok)
            throw new Error(body.error ?? "Unable to load feedback details.");
          return body;
        },
      ),
    )
      .then(([reactions, release]) => {
        setData({
          totals: reactions.reactions,
          readiness: release.readiness,
          evidence: release.evidence,
        });
        setError("");
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [locale, refresh]);
  return (
    <div className="space-y-6 py-4">
      <Button variant="ghost" onClick={() => setRefresh((value) => value + 1)}>
        Refresh reactions and readiness
      </Button>
      {error ? <p role="alert">{error}</p> : null}
      {data ? (
        <>
          <p>
            {data.readiness?.state ?? "Readiness unknown"}
            {data.readiness?.stale ? " · Release evidence is stale" : ""}
          </p>
          {data.evidence ? (
            <p className="theme-text-muted break-all text-sm">
              Checked {data.evidence.checkedAt} at revision{" "}
              {data.evidence.checkedRevision}. Expires {data.evidence.expiresAt}
              . Deployment: {data.evidence.deploymentUrl}
            </p>
          ) : (
            <p className="theme-text-muted">
              No website release evidence recorded.
            </p>
          )}
          <p className="theme-text-muted break-all text-xs">
            Current glossary revision:{" "}
            {data.readiness?.revision ?? "Unavailable"}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="theme-text-muted pb-3 text-left text-xs">
                Reactions by reviewed term version. Browser identities are not
                unique people.
              </caption>
              <thead className="theme-text-faint text-xs">
                <tr className="border-b border-dose-border">
                  <th className="py-2 pr-3 font-medium">Term and translation</th>
                  <th className="py-2 pr-3 font-medium">Looks right</th>
                  <th className="py-2 font-medium">Needs improvement</th>
                </tr>
              </thead>
              <tbody>
                {data.totals.map((row) => (
                  <tr
                    key={`${row.term}:${row.version}`}
                    className="border-b border-dose-border"
                  >
                    <td className="py-3 pr-3">
                      {row.term} ·{" "}
                      <bdi lang={locale} dir="auto">
                        {row.target}
                      </bdi>
                      <VersionDisclosure version={row.version} />
                    </td>
                    <td className="py-3 pr-3 tabular-nums">{row.right}</td>
                    <td className="py-3 tabular-nums">{row.improve}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : !error ? (
        <p role="status">Loading reactions and readiness…</p>
      ) : null}
      <FeedbackReviewQueue
        adapter={adapter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />
    </div>
  );
}

function VersionDisclosure({ version }: { version: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 py-2">
        Version
        <ExpandIndicator isExpanded={open} />
      </summary>
      <p className="max-w-md break-all">{version}</p>
    </details>
  );
}
