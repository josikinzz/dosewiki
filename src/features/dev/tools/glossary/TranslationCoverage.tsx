"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { StateCard } from "@/components/common/StateCard";
import { EditorTable, EditorTableHead, EditorTableHeading, EditorTableBody, EditorTableRow, EditorTableCell } from "@/features/dev/components";

import { combineTranslationCoverage, parseRenderedCoverageEvidence, type RenderedCoverageEvidence } from "../../../../../lib/translation/coverageReport";
import { Input } from "@/components/ui/input";
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
        <p className="theme-text-secondary max-w-3xl text-sm">Compare public source content with stored translations, including content that has never been translated. Processing, human review, and publication are separate steps.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={busy}>{busy ? "Checking coverage" : data ? "Refresh coverage" : "Check coverage"}</Button>
      </div>
      {error ? <StateCard compact tone="danger" title="Coverage check failed" description={error} /> : null}
      {!data ? <StateCard compact loading={busy} title={busy ? "Reading source inventory" : "Coverage has not been checked"} description="Run a check to see source coverage and queue progress for this locale." /> : <>
        <Surface variant="subtle" padding="sm" radius="lg" className="space-y-2">
          <p className="theme-text-primary font-medium">{data.summary.current} of {data.summary.units} source units current across {data.summary.records} records</p>
          <p className="theme-text-secondary text-sm">{data.summary.missing} missing · {data.summary.stale} outdated · {data.summary.rejected} rejected · {data.summary.glossaryMisses} glossary disagreements</p>
          <p className="theme-text-faint text-xs">Current means stored against the current source and translation instructions. It does not mean human approved or verified on the public site. Counts are source units within each record, not translated pages. {data.uniqueHashes} unique source hashes across the inventory.</p>
          <p className="theme-text-faint text-xs">Checked {new Date(data.generatedAt).toLocaleString()}. Source inventory from {new Date(data.inventoryGeneratedAt).toLocaleString()}.</p>
        </Surface>
        <EditorTable>
          <EditorTableHead>{["Content", "Records", "Current / required", "Missing", "Outdated", "Rejected", "Glossary"].map((label) => <EditorTableHeading key={label}>{label}</EditorTableHeading>)}</EditorTableHead>
          <EditorTableBody>{data.byKind.map((kind) => <EditorTableRow key={kind.kind}>
            <EditorTableCell wide>{kind.kind}</EditorTableCell>
            <EditorTableCell label="Records">{kind.records}</EditorTableCell>
            <EditorTableCell label="Current / required">{kind.current} / {kind.units}</EditorTableCell>
            <EditorTableCell label="Missing">{kind.missing}</EditorTableCell>
            <EditorTableCell label="Outdated">{kind.stale}</EditorTableCell>
            <EditorTableCell label="Rejected">{kind.rejected}</EditorTableCell>
            <EditorTableCell label="Glossary">{kind.glossaryMisses}</EditorTableCell>
          </EditorTableRow>)}</EditorTableBody>
        </EditorTable>
        <Surface variant="subtle" padding="sm" radius="lg" className="space-y-2">
          <h3 className="theme-text-primary font-medium">Background processing</h3>
          <p className="theme-text-secondary text-sm">{data.queue.queued} queued · {data.queue.running} running · {data.queue.retrying} retrying · {data.queue.failed} failed · {data.queue.completed} completed jobs</p>
          <p className="theme-text-faint text-xs">A completed job is processing evidence. It is not a count of all translated or published pages.</p>
        </Surface>
        {data.ui ? <Surface variant="subtle" padding="sm" radius="lg" className="space-y-2">
          <h3 className="theme-text-primary font-medium">UI catalog coverage</h3>
          <p className="theme-text-secondary text-sm">{data.ui.translated} of {data.ui.total} registered labels compiled · {data.ui.approved} human approved · {data.ui.missingIds.length} missing · {data.ui.approvalMismatches.length} approved renderings awaiting compilation · {data.ui.glossaryMisses?.length ?? 0} glossary disagreements</p>
          {data.ui.glossaryMisses?.length ? <p className="theme-text-faint text-xs">Glossary disagreements are review suggestions. A human-approved wording may intentionally differ in its UI context.</p> : null}
          <p className="theme-text-faint text-xs">{data.ui.compiledAt ? `Compiled ${new Date(data.ui.compiledAt).toLocaleString()}.` : "No compilation timestamp is recorded."} {data.ui.approvedSnapshotCurrent ? "The compiled approval snapshot is current." : "The compiled approval snapshot needs updating."} Public rendering has not been verified.</p>
        </Surface> : null}
        <Surface variant="subtle" padding="sm" radius="lg" className="space-y-2">
          <h3 className="theme-text-primary font-medium">Rendered route evidence</h3>
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
          <p className="theme-text-faint text-xs">{combined?.rendered.checkedAt ? `Observed ${combined.rendered.checkedAt}` : "No rendered evidence supplied."}</p>
          <ul className="theme-text-secondary text-sm">{combined?.rendered.routes.map((route) => <li key={route.path}>{route.path}: {route.status} · target: {route.url ?? "not recorded"}</li>)}</ul>
          <Button type="button" variant="outline" size="sm" onClick={() => {
            const url = URL.createObjectURL(new Blob([JSON.stringify(combined, null, 2)], { type: "application/json" }));
            const link = document.createElement("a"); link.href = url; link.download = `translation-coverage-${locale}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}>Export combined report</Button>
        </Surface>
        <StateCard compact tone="warning" title="Publication not verified" description={data.publication.message} />
        {data.exclusions.length > 0 ? <div className="theme-text-secondary text-sm"><h3 className="theme-text-primary font-medium">Outside this check</h3><ul className="mt-2 list-disc space-y-1 pl-5">{data.exclusions.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
        <div className="space-y-2">
          <h3 className="theme-text-primary font-medium">Pages needing attention ({data.affectedPagesTotal})</h3>
          {data.pages.length === 0 ? <p className="theme-text-secondary text-sm">No missing or outdated units were found within this inventory.</p> : <>
            <p className="theme-text-faint text-xs">Showing {data.pages.length} of {data.affectedPagesTotal} affected pages. Links open the source page.</p>
            <EditorTable><EditorTableHead><EditorTableHeading>Page</EditorTableHeading><EditorTableHeading>Missing</EditorTableHeading><EditorTableHeading>Outdated</EditorTableHeading><EditorTableHeading>Rejected</EditorTableHeading><EditorTableHeading>Glossary</EditorTableHeading></EditorTableHead>
              <EditorTableBody>{data.pages.map((page) => <EditorTableRow key={`${page.kind}:${page.slug}`}>
                <EditorTableCell wide><a className="theme-accent-underline underline" href={page.href}>{page.slug || "Homepage"}</a><p className="theme-text-faint text-xs">{page.kind}</p></EditorTableCell>
                <EditorTableCell label="Missing">{page.missing}</EditorTableCell><EditorTableCell label="Outdated">{page.stale}</EditorTableCell><EditorTableCell label="Rejected">{page.rejected}</EditorTableCell><EditorTableCell label="Glossary">{page.glossaryMisses}</EditorTableCell>
              </EditorTableRow>)}</EditorTableBody>
            </EditorTable>
          </>}
        </div>
      </>}
    </section>
  );
}
