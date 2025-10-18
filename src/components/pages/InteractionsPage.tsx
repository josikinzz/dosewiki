import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  ArrowLeftRight,
  CircleSlash,
} from "lucide-react";

import type { SubstanceRecord } from "../../data/contentBuilder";
import type { InteractionGroup, InteractionTarget } from "../../types/content";
import { SectionCard } from "../common/SectionCard";
import {
  compareInteractions,
  type InteractionComparisonResult,
  type InteractionSummaryEntry,
  type SharedInteractionEntry,
} from "../../utils/interactions";

interface InteractionsPageProps {
  substances: SubstanceRecord[];
  initialPrimarySlug?: string;
  initialSecondarySlug?: string;
  onNavigateToSubstance: (slug: string) => void;
  onSelectionChange?: (primarySlug: string, secondarySlug: string) => void;
}

const SEVERITY_META: Record<InteractionGroup["severity"], { label: string; tone: string; text: string; chip: string }> = {
  danger: {
    label: "Danger",
    tone: "border-rose-500/40 bg-rose-500/10",
    text: "text-rose-200",
    chip: "bg-rose-500/20 text-rose-100",
  },
  unsafe: {
    label: "Unsafe",
    tone: "border-rose-400/35 bg-rose-400/10",
    text: "text-rose-200",
    chip: "bg-rose-400/20 text-rose-100",
  },
  caution: {
    label: "Caution",
    tone: "border-rose-300/30 bg-rose-300/10",
    text: "text-rose-200",
    chip: "bg-rose-300/15 text-rose-100",
  },
};

const SUMMARY_ICONS: Record<InteractionGroup["severity"], typeof AlertOctagon> = {
  danger: AlertOctagon,
  unsafe: AlertTriangle,
  caution: AlertCircle,
};

const formatTargetLabel = (target: InteractionTarget): string => {
  if (target.matchedSubstanceName) {
    return target.matchedSubstanceName;
  }
  if (target.classLabel) {
    return target.classLabel;
  }
  return target.display;
};

const renderTargetRationale = (target: InteractionTarget) => {
  if (!target.rationale) {
    return null;
  }
  return <p className="mt-1 text-xs text-white/60">{target.rationale}</p>;
};

const renderTargetBadge = (target: InteractionTarget) => {
  if (target.matchType === "class" && target.classLabel) {
    return (
      <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-xs font-medium text-fuchsia-200">
        Class match
      </span>
    );
  }
  if ((target.matchType === "substance" || target.matchType === "alias") && target.matchedSubstanceName) {
    return (
      <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-200">
        Linked substance
      </span>
    );
  }
  return null;
};

const LIST_CHUNK_SIZE = 24;

const InteractionSummaryList = ({
  entries,
  subjectName,
  severity,
  onNavigate,
}: {
  entries: InteractionSummaryEntry[];
  subjectName: string;
  severity: InteractionGroup["severity"];
  onNavigate: (slug: string) => void;
}) => {
  if (entries.length === 0) {
    return <p className="text-sm text-white/60">No documented entries.</p>;
  }

  const [visibleCount, setVisibleCount] = useState(() => Math.min(entries.length, LIST_CHUNK_SIZE));

  useEffect(() => {
    setVisibleCount(Math.min(entries.length, LIST_CHUNK_SIZE));
  }, [entries]);

  const visibleEntries = entries.slice(0, visibleCount);
  const hasAdditionalEntries = visibleCount < entries.length;

  return (
    <>
      <ul className="space-y-3 gap-fallback-col-3">
        {visibleEntries.map((entry) => {
          const label = formatTargetLabel(entry.target);
          const badge = renderTargetBadge(entry.target);
          return (
            <li key={`${subjectName}-${entry.slug}`} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-3 gap-fallback-row-3">
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => entry.target.matchedSubstanceSlug && onNavigate(entry.target.matchedSubstanceSlug)}
                    disabled={!entry.target.matchedSubstanceSlug}
                    className={`text-sm font-semibold text-white transition hover:text-fuchsia-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                      entry.target.matchedSubstanceSlug ? "" : "cursor-default text-white/80"
                    }`}
                  >
                    {label}
                  </button>
                  {badge}
                  {renderTargetRationale(entry.target)}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${SEVERITY_META[severity].chip}`}>
                  {SEVERITY_META[severity].label}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {hasAdditionalEntries ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            className="inline-flex items-center gap-2 gap-fallback-row-2 rounded-full border border-white/15 px-4 py-1.5 text-sm font-medium text-white/85 transition hover:border-fuchsia-400/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
            onClick={() => setVisibleCount((previous) => Math.min(entries.length, previous + LIST_CHUNK_SIZE))}
          >
            Show more
          </button>
        </div>
      ) : null}
    </>
  );
};

const SharedInteractionList = ({
  entries,
  primaryName,
  secondaryName,
  onNavigate,
}: {
  entries: SharedInteractionEntry[];
  primaryName: string;
  secondaryName: string;
  onNavigate: (slug: string) => void;
}) => {
  if (entries.length === 0) {
    return <p className="text-sm text-white/60">No shared warnings.</p>;
  }

  const [visibleCount, setVisibleCount] = useState(() => Math.min(entries.length, LIST_CHUNK_SIZE));

  useEffect(() => {
    setVisibleCount(Math.min(entries.length, LIST_CHUNK_SIZE));
  }, [entries]);

  const visibleEntries = entries.slice(0, visibleCount);
  const hasMore = visibleCount < entries.length;

  return (
    <>
      <ul className="space-y-3 gap-fallback-col-3">
        {visibleEntries.map((entry) => {
          const label = formatTargetLabel(entry.primary.target);
          const badge = renderTargetBadge(entry.primary.target) ?? renderTargetBadge(entry.secondary.target);
          return (
            <li key={`shared-${entry.slug}`} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-3 gap-fallback-row-3">
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      entry.primary.target.matchedSubstanceSlug &&
                      onNavigate(entry.primary.target.matchedSubstanceSlug)
                    }
                    disabled={!entry.primary.target.matchedSubstanceSlug}
                    className={`text-sm font-semibold text-white transition hover:text-fuchsia-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                      entry.primary.target.matchedSubstanceSlug ? "" : "cursor-default text-white/80"
                    }`}
                  >
                    {label}
                  </button>
                  {badge}
                  {entry.primary.target.rationale && (
                    <p className="text-xs text-white/60">
                      {primaryName}: {entry.primary.target.rationale}
                    </p>
                  )}
                  {entry.secondary.target.rationale && (
                    <p className="text-xs text-white/60">
                      {secondaryName}: {entry.secondary.target.rationale}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 gap-fallback-col-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
                      SEVERITY_META[entry.highestSeverity].chip
                    }`}
                  >
                    {SEVERITY_META[entry.highestSeverity].label}
                  </span>
                  <dl className="text-right text-[11px] text-white/70">
                    <div>
                      <dt className="inline text-white/60">{primaryName}:</dt>
                      <dd className="ml-1 inline capitalize">{entry.primary.severity}</dd>
                    </div>
                    <div>
                      <dt className="inline text-white/60">{secondaryName}:</dt>
                      <dd className="ml-1 inline capitalize">{entry.secondary.severity}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            className="inline-flex items-center gap-2 gap-fallback-row-2 rounded-full border border-white/15 px-4 py-1.5 text-sm font-medium text-white/85 transition hover:border-fuchsia-400/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
            onClick={() => setVisibleCount((previous) => Math.min(entries.length, previous + LIST_CHUNK_SIZE))}
          >
            Show more
          </button>
        </div>
      ) : null}
    </>
  );
};

export function InteractionsPage({
  substances,
  initialPrimarySlug,
  initialSecondarySlug,
  onNavigateToSubstance,
  onSelectionChange,
}: InteractionsPageProps) {
  const interactingSubstances = useMemo(() => {
    const availableSlugs = new Set(substances.map((record) => record.slug));
    const eligible = new Set<string>();

    substances.forEach((record) => {
      record.content.interactions.forEach((group) => {
        group.items.forEach((target) => {
          const partnerSlug = target.matchedSubstanceSlug;
          if (partnerSlug && partnerSlug !== record.slug && availableSlugs.has(partnerSlug)) {
            eligible.add(record.slug);
            eligible.add(partnerSlug);
          }
        });
      });
    });

    return substances.filter((record) => eligible.has(record.slug));
  }, [substances]);

  const sortedSubstances = useMemo(
    () => [...interactingSubstances].sort((a, b) => a.name.localeCompare(b.name)),
    [interactingSubstances],
  );

  const substanceLookup = useMemo(
    () => new Map(sortedSubstances.map((record) => [record.slug, record])),
    [sortedSubstances],
  );

  const [primarySlug, setPrimarySlug] = useState<string>(() => sortedSubstances[0]?.slug ?? "");
  const [secondarySlug, setSecondarySlug] = useState<string>(() => {
    if (sortedSubstances.length === 0) {
      return "";
    }
    const fallbackPrimary = sortedSubstances[0].slug;
    const alternative = sortedSubstances.find((record) => record.slug !== fallbackPrimary)?.slug ?? fallbackPrimary;
    return alternative;
  });

  const lastSyncedSelection = useRef<{ primary: string; secondary: string } | null>(null);

  useEffect(() => {
    if (sortedSubstances.length === 0) {
      setPrimarySlug("");
      setSecondarySlug("");
      lastSyncedSelection.current = { primary: "", secondary: "" };
      return;
    }

    const fallbackPrimary = sortedSubstances[0].slug;
    const resolvedPrimary =
      initialPrimarySlug && substanceLookup.has(initialPrimarySlug)
        ? initialPrimarySlug
        : fallbackPrimary;

    let resolvedSecondary: string;
    if (initialSecondarySlug && substanceLookup.has(initialSecondarySlug)) {
      resolvedSecondary = initialSecondarySlug;
    } else {
      const alternative = sortedSubstances.find((record) => record.slug !== resolvedPrimary);
      resolvedSecondary = alternative?.slug ?? resolvedPrimary;
    }

    if (resolvedSecondary === resolvedPrimary && sortedSubstances.length > 1) {
      const alternative = sortedSubstances.find((record) => record.slug !== resolvedPrimary);
      if (alternative) {
        resolvedSecondary = alternative.slug;
      }
    }

    const previous = lastSyncedSelection.current;
    const selectionChanged =
      !previous || previous.primary !== resolvedPrimary || previous.secondary !== resolvedSecondary;

    const providedPrimaryValid = initialPrimarySlug !== undefined && substanceLookup.has(initialPrimarySlug);
    const providedSecondaryValid = initialSecondarySlug !== undefined && substanceLookup.has(initialSecondarySlug);
    const shouldSyncSelection = !providedPrimaryValid || !providedSecondaryValid;

    if (selectionChanged) {
      setPrimarySlug(resolvedPrimary);
      setSecondarySlug(resolvedSecondary);
      lastSyncedSelection.current = { primary: resolvedPrimary, secondary: resolvedSecondary };

      if (shouldSyncSelection && onSelectionChange && resolvedPrimary && resolvedSecondary) {
        onSelectionChange(resolvedPrimary, resolvedSecondary);
      }
    } else if (shouldSyncSelection && onSelectionChange && resolvedPrimary && resolvedSecondary) {
      lastSyncedSelection.current = { primary: resolvedPrimary, secondary: resolvedSecondary };
      onSelectionChange(resolvedPrimary, resolvedSecondary);
    }
  }, [
    sortedSubstances,
    substanceLookup,
    initialPrimarySlug,
    initialSecondarySlug,
    onSelectionChange,
  ]);

  const updateSelection = useCallback(
    (nextPrimary: string, nextSecondary: string) => {
      setPrimarySlug(nextPrimary);
      setSecondarySlug(nextSecondary);
      lastSyncedSelection.current = { primary: nextPrimary, secondary: nextSecondary };
      if (nextPrimary && nextSecondary) {
        onSelectionChange?.(nextPrimary, nextSecondary);
      }
    },
    [onSelectionChange],
  );

  const primary = primarySlug ? substanceLookup.get(primarySlug) ?? null : null;
  const secondary = secondarySlug ? substanceLookup.get(secondarySlug) ?? null : null;

  const comparison: InteractionComparisonResult | null = useMemo(() => {
    if (!primary || !secondary) {
      return null;
    }
    return compareInteractions(primary, secondary);
  }, [primary, secondary]);

  const handleSwap = () => {
    updateSelection(secondarySlug, primarySlug);
  };

  const handleReset = () => {
    const fallbackPrimary = sortedSubstances[0]?.slug ?? "";
    const alternative = sortedSubstances.find((record) => record.slug !== fallbackPrimary)?.slug ?? fallbackPrimary;
    updateSelection(fallbackPrimary, alternative);
  };

  const severitySummary = comparison?.highestRisk;
  const SummaryIcon = severitySummary ? SUMMARY_ICONS[severitySummary] : CircleSlash;

  const directFromPrimary = comparison?.directMatches.filter((entry) => entry.direction === "primary") ?? [];
  const directFromSecondary = comparison?.directMatches.filter((entry) => entry.direction === "secondary") ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-12">
      <div className="mb-6 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)]">
        <div className="flex items-start gap-3 gap-fallback-row-3 text-rose-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-200" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-rose-100">
              Under construction
            </p>
            <p className="mt-1 text-sm text-rose-100/80">
              This interactions comparison is still under construction, and we&apos;re continuing to collect the
              dataset that powers it.
            </p>
          </div>
        </div>
      </div>

      <SectionCard className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 gap-fallback-wrap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">Interactions comparison</h1>
            <p className="mt-1 text-sm text-white/70">
              Select two substances to review overlapping risks, unique warnings, and direct cross references.
            </p>
          </div>
          <div className="flex items-center gap-2 gap-fallback-row-2">
            <button
              type="button"
              onClick={handleSwap}
              className="inline-flex items-center gap-2 gap-fallback-row-2 rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
            >
              <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
              Swap
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-2 gap-fallback-row-2 rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr,auto,1fr] md:items-end">
          <div>
            <label htmlFor="primary-substance" className="text-sm font-medium text-white/80">
              Substance A
            </label>
            <select
              id="primary-substance"
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#16112a] px-3 py-2 text-sm text-white focus:border-fuchsia-400 focus:outline-none"
              value={primarySlug}
              onChange={(event) => {
                const nextPrimary = event.target.value;
                updateSelection(nextPrimary, secondarySlug);
              }}
            >
              {sortedSubstances.map((record) => (
                <option key={`primary-${record.slug}`} value={record.slug}>
                  {record.name}
                </option>
              ))}
            </select>
          </div>
          <div className="hidden md:flex md:flex-col md:items-center md:justify-center">
            <ArrowLeftRight className="h-5 w-5 text-white/60" aria-hidden="true" />
          </div>
          <div>
            <label htmlFor="secondary-substance" className="text-sm font-medium text-white/80">
              Substance B
            </label>
            <select
              id="secondary-substance"
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#16112a] px-3 py-2 text-sm text-white focus:border-fuchsia-400 focus:outline-none"
              value={secondarySlug}
              onChange={(event) => {
                const nextSecondary = event.target.value;
                updateSelection(primarySlug, nextSecondary);
              }}
            >
              {sortedSubstances.map((record) => (
                <option key={`secondary-${record.slug}`} value={record.slug}>
                  {record.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap items-center gap-4 gap-fallback-wrap-4">
            <div className={`flex items-center gap-3 gap-fallback-row-3 rounded-xl border bg-white/5 px-3 py-2 ${
              severitySummary ? SEVERITY_META[severitySummary].tone : "border-white/10"
            }`}>
              <SummaryIcon className={`h-5 w-5 ${severitySummary ? SEVERITY_META[severitySummary].text : "text-white/60"}`} />
              <div>
                <p className="text-sm font-semibold text-white">
                  {severitySummary ? `${SEVERITY_META[severitySummary].label} risk noted` : "No combined risk recorded"}
                </p>
                {severitySummary ? (
                  <p className="text-xs text-white/70">
                    Highest severity observed across shared warnings and direct references.
                  </p>
                ) : (
                  <p className="text-xs text-white/60">
                    No overlapping risk entries were found for this pair.
                  </p>
                )}
              </div>
            </div>

            {comparison?.sharedClassHighlights.length ? (
              <div className="flex flex-wrap items-center gap-2 gap-fallback-wrap-3">
                {comparison.sharedClassHighlights.map((entry) => (
                  <span
                    key={entry.key}
                    className="rounded-full bg-fuchsia-500/15 px-3 py-1 text-xs font-semibold text-fuchsia-200"
                  >
                    Shared class: {entry.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-[#110b24] p-4">
              <p className="text-sm font-semibold text-white">{primary?.name ?? "Select a substance"}</p>
              {directFromPrimary.length > 0 ? (
                <ul className="mt-2 space-y-2 text-xs text-white/70">
                  {directFromPrimary.map((entry, index) => (
                    <li key={`primary-direct-${index}`}>
                      Mentions {secondary?.name ?? "the other selection"} as {entry.severity}.
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-white/60">No direct mention of the other substance.</p>
              )}
            </div>
            <div className="rounded-xl border border-white/10 bg-[#110b24] p-4">
              <p className="text-sm font-semibold text-white">{secondary?.name ?? "Select a substance"}</p>
              {directFromSecondary.length > 0 ? (
                <ul className="mt-2 space-y-2 text-xs text-white/70">
                  {directFromSecondary.map((entry, index) => (
                    <li key={`secondary-direct-${index}`}>
                      Mentions {primary?.name ?? "the other selection"} as {entry.severity}.
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-white/60">No direct mention of the other substance.</p>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {primary && secondary ? (
        <SectionCard className="mt-8 space-y-8">
          <h2 className="text-xl font-semibold text-white">Detailed comparison</h2>
          <div className="space-y-10">
            {comparison?.buckets.map((bucket) => {
              const severityMeta = SEVERITY_META[bucket.severity];
              return (
                <div key={`bucket-${bucket.severity}`} className="space-y-4">
                  <div className="flex items-center gap-2 gap-fallback-row-2">
                    <span className={`inline-flex items-center gap-2 gap-fallback-row-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase ${severityMeta.tone}`}>
                      {severityMeta.label}
                    </span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-white">Shared</p>
                      <SharedInteractionList
                        entries={bucket.shared}
                        primaryName={primary.name}
                        secondaryName={secondary.name}
                        onNavigate={onNavigateToSubstance}
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-white">Only {primary.name}</p>
                      <InteractionSummaryList
                        entries={bucket.onlyPrimary}
                        subjectName={primary.name}
                        severity={bucket.severity}
                        onNavigate={onNavigateToSubstance}
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-white">Only {secondary.name}</p>
                      <InteractionSummaryList
                        entries={bucket.onlySecondary}
                        subjectName={secondary.name}
                        severity={bucket.severity}
                        onNavigate={onNavigateToSubstance}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      ) : (
        <SectionCard className="mt-8 text-center text-sm text-white/60">
          Select two substances to generate a comparison.
        </SectionCard>
      )}
    </div>
  );
}
