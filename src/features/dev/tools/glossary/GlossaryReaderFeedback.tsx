"use client";
import { useEffect, useMemo, useState } from "react";
import {
  FeedbackReviewQueue,
  type FeedbackQueueFilter,
} from "../feedback/FeedbackReviewQueue";
import { glossaryFeedbackAdapter } from "../feedback/glossaryFeedbackAdapter";
import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EditorStatusPill, LoadErrorState } from "@/features/dev/components";
import { RowSkeletons, When } from "./workbenchParts";
import type { LanguageRelease } from "@server/translation/languageReadiness";

type ReactionTotals = {
  term: string;
  target: string;
  version: string;
  right: number;
  improve: number;
};
/** Reader feedback and website readiness, a section of the Articles view. */
export function GlossaryReaderFeedback({ locale }: { locale: string }) {
  return <ReviewContent key={locale} locale={locale} />;
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
  const evidence = data?.evidence ?? null;
  return (
    <div className="space-y-8">
      <section aria-labelledby={`readiness-${locale}`} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id={`readiness-${locale}`} className="theme-text-primary text-base font-semibold">Website readiness and reactions</h3>
          <Button variant="outline" size="sm" onClick={() => setRefresh((value) => value + 1)}>
            <Icon icon="lucide:refresh-cw" size={14} />
            Refresh reactions and readiness
          </Button>
        </div>
        {error ? <LoadErrorState what="the reactions and readiness" message={error} onRetry={() => setRefresh((value) => value + 1)} /> : null}
        {data ? (
          <>
            <dl className="grid gap-x-6 gap-y-3 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-4 text-sm sm:grid-cols-3">
              <div className="space-y-1">
                <dt className="type-meta-label theme-text-muted">Readiness</dt>
                <dd className="theme-text-primary flex flex-wrap items-center gap-2">
                  {data.readiness?.state ?? "Readiness unknown"}
                  {data.readiness?.stale ? <EditorStatusPill tone="warning" inline>Release evidence is stale</EditorStatusPill> : null}
                </dd>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <dt className="type-meta-label theme-text-muted">Release evidence</dt>
                <dd className="theme-text-secondary">
                  {evidence ? (
                    <>
                      Checked <When at={evidence.checkedAt} /> at revision <span className="break-all" title={evidence.checkedRevision}>{evidence.checkedRevision}</span>; expires <When at={evidence.expiresAt} />.{" "}
                      <a href={evidence.deploymentUrl} target="_blank" rel="noopener noreferrer" className="text-dose-accent-strong theme-accent-underline break-all underline-offset-4 hover:underline">Deployment: {evidence.deploymentUrl}</a>
                    </>
                  ) : "No website release evidence recorded."}
                </dd>
              </div>
              <div className="space-y-1 sm:col-span-3">
                <dt className="type-meta-label theme-text-muted">Current glossary revision</dt>
                <dd className="theme-text-secondary break-all text-xs">{data.readiness?.revision ?? "Unavailable"}</dd>
              </div>
            </dl>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="theme-text-muted pb-3 text-left text-xs">
                  Reactions by reviewed term version. Browser identities are not
                  unique people.
                </caption>
                <thead className="theme-text-muted text-xs">
                  <tr className="border-b border-dose-border">
                    <th className="py-2 pr-3 font-medium">Term and translation</th>
                    <th className="py-2 pr-3 text-right font-medium">Looks right</th>
                    <th className="py-2 text-right font-medium">Needs improvement</th>
                  </tr>
                </thead>
                <tbody>
                  {data.totals.length === 0 ? (
                    <tr><td colSpan={3} className="theme-text-muted py-3">No reactions yet.</td></tr>
                  ) : data.totals.map((row) => (
                    <tr
                      key={`${row.term}:${row.version}`}
                      className="border-b border-dose-border align-top"
                    >
                      <td className="py-2.5 pr-3">
                        <span className="theme-text-primary">{row.term}</span>
                        <span aria-hidden className="theme-text-faint"> → </span>
                        <span className="sr-only">, </span>
                        <bdi lang={locale} dir="auto">
                          {row.target}
                        </bdi>
                        <VersionDisclosure version={row.version} />
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{row.right}</td>
                      <td className={`py-2.5 text-right tabular-nums ${row.improve > row.right ? "text-[color:var(--theme-warning-text)]" : ""}`}>{row.improve}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : !error ? (
          <RowSkeletons rows={3} label="reactions and readiness" />
        ) : null}
      </section>
      <section aria-label="Reader suggestions" className="space-y-3">
        <FeedbackReviewQueue
          adapter={adapter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />
      </section>
    </div>
  );
}

function VersionDisclosure({ version }: { version: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="theme-text-muted flex cursor-pointer list-none items-center gap-1 py-1 text-xs">
        Version
        <ExpandIndicator isExpanded={open} />
      </summary>
      <p className="theme-text-muted max-w-md break-all text-xs">{version}</p>
    </details>
  );
}
