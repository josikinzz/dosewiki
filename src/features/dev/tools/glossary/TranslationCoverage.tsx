"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { LoadErrorState, EditorTable, EditorTableHead, EditorTableHeading, EditorTableBody, EditorTableRow, EditorTableCell } from "@/features/dev/components";

import { combineTranslationCoverage, parseRenderedCoverageEvidence, type RenderedCoverageEvidence } from "../../../../../lib/translation/coverageReport";
import { Input } from "@/components/ui/input";
import { RowSkeletons, When } from "./workbenchParts";
import type { TranslationCoverageResponse as Coverage } from "@lib/translation/translationCoverageTypes";

export function TranslationCoverage({ locale }: { locale: string }) {
  const evidenceId = useId();
  const [data, setData] = useState<Coverage | null>(null);
  const [evidence, setEvidence] = useState<RenderedCoverageEvidence | null>(null);
  const combined = data ? combineTranslationCoverage(data, evidence, ["/", "/replications"], data.catalogDigest ?? null) : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const load = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/dev/translation-coverage?locale=${encodeURIComponent(locale)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to check translation coverage.");
      setData(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to check translation coverage.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <section aria-label="Translation coverage" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="theme-text-secondary max-w-3xl text-sm">Compare public source content with stored translations, including content that has never been translated.</p>
        <Button type="button" variant={data ? "outline" : "accent"} size="sm" onClick={() => void load()} disabled={busy} aria-busy={busy || undefined}>
          <Icon icon="lucide:refresh-cw" size={14} className={busy ? "motion-safe:animate-spin" : undefined} />
          {busy ? "Checking coverage" : data ? "Refresh coverage" : "Check coverage"}
        </Button>
      </div>
      {error ? <LoadErrorState what="the coverage check" message={error} onRetry={() => void load()} busy={busy} /> : null}
      {!data ? (
        busy ? <RowSkeletons rows={3} label="the source inventory" /> : (
          <div className="rounded-card border border-dashed border-[color:var(--editor-panel-border)] px-5 py-6">
            <p className="theme-text-primary font-medium">Coverage has not been checked</p>
            <p className="theme-text-secondary mt-1 text-sm">Run a check to see source coverage and queue progress for this language. It reads the whole source inventory, so it runs only when you ask.</p>
          </div>
        )
      ) : <>
        <div className="space-y-3 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-4" data-testid="coverage-strip">
          <p className="theme-text-primary text-base font-semibold tabular-nums">{data.summary.current} of {data.summary.units} source units current across {data.summary.records} records</p>
          <div aria-hidden className="flex h-2 overflow-hidden rounded-full theme-progress-track">
            <span className="block h-full bg-[var(--theme-accent)]" style={{ width: `${data.summary.units ? (data.summary.current / data.summary.units) * 100 : 0}%` }} />
          </div>
          <p className="theme-text-secondary text-sm tabular-nums">{data.summary.missing} missing · {data.summary.stale} outdated · {data.summary.rejected} rejected · {data.summary.glossaryMisses} glossary disagreements · {data.summary.repeatedPunctuation} doubled punctuation · {data.summary.leftoverLatin} leftover English</p>
          <p className="theme-text-muted text-xs tabular-nums">Jobs: {data.queue.queued} queued · {data.queue.running} running · {data.queue.retrying} retrying · {data.queue.failed} failed · {data.queue.completed} completed jobs</p>
        </div>
        <p className="theme-text-faint text-xs">Current means stored against the current source and translation instructions. Counts are source units, not pages; {data.uniqueHashes} unique source hashes. Checked <When at={data.generatedAt} withTime />; source inventory from <When at={data.inventoryGeneratedAt} withTime />.</p>
        <EditorTable>
          <EditorTableHead>{["Content", "Records", "Current / required", "Missing", "Outdated", "Rejected", "Glossary", "Punctuation", "English"].map((label) => <EditorTableHeading key={label}>{label}</EditorTableHeading>)}</EditorTableHead>
          <EditorTableBody>{data.byKind.map((kind) => <EditorTableRow key={kind.kind}>
            <EditorTableCell wide>{kind.kind}</EditorTableCell>
            <EditorTableCell label="Records">{kind.records}</EditorTableCell>
            <EditorTableCell label="Current / required">{kind.current} / {kind.units}</EditorTableCell>
            <EditorTableCell label="Missing">{kind.missing}</EditorTableCell>
            <EditorTableCell label="Outdated">{kind.stale}</EditorTableCell>
            <EditorTableCell label="Rejected">{kind.rejected}</EditorTableCell>
            <EditorTableCell label="Glossary">{kind.glossaryMisses}</EditorTableCell>
            <EditorTableCell label="Punctuation">{kind.repeatedPunctuation}</EditorTableCell>
            <EditorTableCell label="English">{kind.leftoverLatin}</EditorTableCell>
          </EditorTableRow>)}</EditorTableBody>
        </EditorTable>
        {data.ui ? <Surface variant="subtle" padding="sm" radius="lg" className="space-y-2">
          <h3 className="type-meta-label theme-text-muted">UI catalog coverage</h3>
          <p className="theme-text-secondary text-sm">{data.ui.translated} of {data.ui.total} registered labels compiled · {data.ui.approved} human approved · {data.ui.missingIds.length} missing · {data.ui.approvalMismatches.length} approved renderings awaiting compilation · {data.ui.glossaryMisses?.length ?? 0} glossary disagreements</p>
          {data.ui.glossaryMisses?.length ? <p className="theme-text-faint text-xs">Glossary disagreements are review suggestions. A human-approved wording may intentionally differ in its UI context.</p> : null}
          <p className="theme-text-faint text-xs">{data.ui.compiledAt ? <>Compiled <When at={data.ui.compiledAt} />.</> : "No compilation timestamp is recorded."} {data.ui.approvedSnapshotCurrent ? "The compiled approval snapshot is current." : "The compiled approval snapshot needs updating."}</p>
        </Surface> : null}
        <Surface variant="subtle" padding="sm" radius="lg" className="space-y-2">
          <h3 className="type-meta-label theme-text-muted">Rendered route evidence</h3>
          <p className="theme-text-secondary text-sm">Import a release-check JSON report to compare its dated observations with this catalog. Other routes and interactive states remain unverified.</p>
          <label htmlFor={evidenceId} className="theme-text-secondary text-sm">Release evidence JSON<Input id={evidenceId} type="file" accept="application/json,.json" onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
              if (file.size > 1024 * 1024) throw new Error("Choose a report smaller than 1 MB.");
              const next = parseRenderedCoverageEvidence(JSON.parse(await file.text()));
              if (next.locale !== locale) throw new Error("The report belongs to a different locale.");
              setEvidence(next); setError(null);
            } catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid report."); }
          }} /></label>
          <p className="theme-text-faint text-xs">{combined?.rendered.checkedAt ? <>Observed <When at={combined.rendered.checkedAt} withTime /></> : "No rendered evidence supplied."}</p>
          <ul className="theme-text-secondary text-sm">{combined?.rendered.routes.map((route) => <li key={route.path}>{route.path}: {route.status} · target: {route.url ?? "not recorded"}</li>)}</ul>
          <Button type="button" variant="outline" size="sm" onClick={() => {
            const url = URL.createObjectURL(new Blob([JSON.stringify(combined, null, 2)], { type: "application/json" }));
            const link = document.createElement("a"); link.href = url; link.download = `translation-coverage-${locale}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}>Export combined report</Button>
        </Surface>
        <StateCard compact tone="warning" title="Publication not verified" description={data.publication.message} />
        {data.exclusions.length > 0 ? <div className="theme-text-secondary text-sm"><h3 className="type-meta-label theme-text-muted">Outside this check</h3><ul className="mt-2 list-disc space-y-1 pl-5">{data.exclusions.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
        <div className="space-y-2">
          <h3 className="type-meta-label theme-text-muted">Pages needing attention · {data.affectedPagesTotal}</h3>
          {data.pages.length === 0 ? <p className="theme-text-secondary text-sm">No missing or outdated units were found within this inventory.</p> : <>
            <p className="theme-text-faint text-xs">Showing {data.pages.length} of {data.affectedPagesTotal} affected pages. Links open the source page.</p>
            <EditorTable><EditorTableHead><EditorTableHeading>Page</EditorTableHeading><EditorTableHeading>Missing</EditorTableHeading><EditorTableHeading>Outdated</EditorTableHeading><EditorTableHeading>Rejected</EditorTableHeading><EditorTableHeading>Glossary</EditorTableHeading><EditorTableHeading>Punctuation</EditorTableHeading><EditorTableHeading>English</EditorTableHeading></EditorTableHead>
              <EditorTableBody>{data.pages.map((page) => <EditorTableRow key={`${page.kind}:${page.slug}`}>
                <EditorTableCell wide><a className="text-dose-accent-strong theme-accent-underline underline-offset-4 hover:underline" href={page.href} target="_blank" rel="noopener noreferrer">{page.slug || "Homepage"}</a><p className="theme-text-faint text-xs">{page.kind}</p></EditorTableCell>
                <EditorTableCell label="Missing">{page.missing}</EditorTableCell><EditorTableCell label="Outdated">{page.stale}</EditorTableCell><EditorTableCell label="Rejected">{page.rejected}</EditorTableCell><EditorTableCell label="Glossary">{page.glossaryMisses}</EditorTableCell><EditorTableCell label="Punctuation">{page.repeatedPunctuation}</EditorTableCell><EditorTableCell label="English">{page.leftoverLatin}</EditorTableCell>
              </EditorTableRow>)}</EditorTableBody>
            </EditorTable>
          </>}
        </div>
      </>}
    </section>
  );
}
