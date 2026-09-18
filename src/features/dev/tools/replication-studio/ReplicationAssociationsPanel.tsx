"use client";

/**
 * Replication → drug association editor — `/dev` → Replications → one selected
 * replication → "Showing on N of M drug articles".
 *
 * Associations have two sources: effect/name matching proposes candidates, while
 * an editor may curate a showcase-eligible replication directly on one drug.
 * “Add to drugs” writes that per-gallery curation without changing the
 * replication's owning effect or tags. The checkbox list edits the same
 * gallery's `removed_slugs`: unticking affects that drug only, and can move a
 * directly curated work from its curated position into the retained exclusion
 * set.
 *
 * A tick is eligibility, not publication. Under the publish gate a drug shows
 * this replication only once it has been curated on that drug's board, so every
 * row reads out its own state — showing (with its position), eligible but not
 * curated, or excluded — and the header counts publications, not ticks.
 *
 * Unticking a drug that pinned this replication into its curated head is
 * allowed but never silent: the row warns inline and the save summary counts
 * the positions the save will drop, because `curated_slugs` and
 * `removed_slugs` may not overlap.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { SkeletonPulse } from "@/components/layout/PublicFeedbackPrimitives";
import { Button } from "@/components/ui/button";
import { EmptyStateSurface } from "@/components/ui/surface";
import {
  ActionNotice,
  EditorActionGroup,
  EditorActionStatus,
  EditorCheckbox,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
  TagToken,
  type ActionNoticeTone,
} from "@/features/dev/components";
import { isShowcaseEligible } from "@/data/substanceReplicationGallery";

import type { StudioRow } from "./replicationStudioModel";
import { SubstanceTargetPicker } from "./SubstanceTargetPicker";
import {
  placeReplicationsOnSubstances,
  preflightReplicationPlacement,
  type PlacementPreflight,
  type PlacementTargetResult,
} from "./replicationPlacementService";
import { fetchGalleryDetail } from "./substanceGalleryApi";
import {
  associationStateOf,
  associationStatesEqual,
  setAllAssociations,
  summarizeAssociations,
  toggleAssociation,
  type AssociationState,
  type ReplicationAssociation,
} from "./replicationAssociationModel";

const ASSOCIATIONS_API = "/api/dev/replications/associations";

type Feedback = { tone: ActionNoticeTone; message: string };

/**
 * A string discriminant, not `ok: boolean`: this project compiles with
 * `strictNullChecks: false`, under which boolean-literal narrowing does not hold.
 */
type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: ReplicationAssociation[] };

type SaveState = "idle" | "saving" | "saved" | "error";

type DroppedPosition = { substance_slug: string; position: number };

type PlacementPreviewState =
  | { status: "loading" }
  | { status: "ready"; preflight: PlacementPreflight }
  | { status: "error"; message: string };

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? fallback;
  } catch {
    return fallback;
  }
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** Row-shaped placeholders, so the list's rhythm is established before its data. */
function AssociationsSkeleton() {
  return (
    <div aria-hidden className="space-y-2">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="flex items-start gap-2.5 rounded-xl border border-[color:var(--editor-chip-border)] px-3 py-2.5"
        >
          <SkeletonPulse width="w-4" height="h-4" tone="strong" className="mt-0.5 shrink-0 rounded" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <SkeletonPulse width="w-2/5" height="h-3.5" tone="strong" />
            <SkeletonPulse width="w-1/2" height="h-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

const MATCH_LABEL: Record<ReplicationAssociation["matchedVia"], string> = {
  specific_drug: "exact drug",
  drug_class: "general class",
  visual_disconnection: "visual fallback",
  curated: "direct association",
};

/** What one row means on its drug article after the draft exclusion. */
type RowState = "published" | "excluded";

const ROW_STATE_TONE: Record<RowState, "success" | "danger"> = {
  published: "success",
  excluded: "danger",
};

function AssociationRow({
  row,
  checked,
  atRisk,
  disabled,
  onToggle,
}: {
  row: ReplicationAssociation;
  checked: boolean;
  atRisk: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const state: RowState = checked ? "published" : "excluded";

  return (
    <li className="list-none">
      <div
        className={[
          "theme-replication-association-row rounded-xl border border-transparent px-3 py-2.5",
          "transition",
          checked ? undefined : "opacity-70",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <EditorCheckbox
            id={`replication-association-${row.slug}`}
            checked={checked}
            disabled={disabled}
            onChange={onToggle}
            label={row.title}
            containerClassName="min-w-0 flex-1"
            description={
              <span className="inline-flex max-w-full flex-wrap items-center gap-1.5">
                <span>{MATCH_LABEL[row.matchedVia]}</span>
                <span aria-hidden="true">·</span>
                <TagToken variant="compact" label={row.effectName} />
              </span>
            }
          />
          <EditorStatusPill
            tone={ROW_STATE_TONE[state]}
            className="mt-0.5 shrink-0"
            data-testid={`association-state-${row.slug}`}
          >
            {state === "published"
              ? row.curatedPosition === null
                ? "Showing · automatic"
                : `Showing · priority ${row.curatedPosition}`
              : "Excluded"}
          </EditorStatusPill>
        </div>
        {atRisk ? (
          <p
            className="theme-warning-text mt-1.5 flex items-start gap-1.5 pl-[1.625rem] text-xs leading-5"
            data-testid={`curated-warning-${row.slug}`}
          >
            <Icon icon="lucide:triangle-alert" size={13} className="mt-0.5 shrink-0" />
            <span>
              priority {row.curatedPosition} — unticking removes that position and excludes the work
            </span>
          </p>
        ) : null}
      </div>
    </li>
  );
}

function DirectPlacementEditor({
  row,
  eligibilityDirty,
  onPlaced,
}: {
  row: StudioRow;
  eligibilityDirty: boolean;
  onPlaced: () => void;
}) {
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [previews, setPreviews] = useState<Record<string, PlacementPreviewState>>({});
  const [results, setResults] = useState<PlacementTargetResult[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResults(null);
    if (selectedSlugs.length === 0) {
      setPreviews({});
      return;
    }
    setPreviews(
      Object.fromEntries(selectedSlugs.map((slug) => [slug, { status: "loading" as const }])),
    );
    void Promise.all(
      selectedSlugs.map(async (substanceSlug) => {
        const detail = await fetchGalleryDetail(substanceSlug);
        return detail.status === "ready"
          ? {
              slug: substanceSlug,
              state: {
                status: "ready" as const,
                preflight: preflightReplicationPlacement(detail.detail, [row.slug]),
              },
            }
          : {
              slug: substanceSlug,
              state: { status: "error" as const, message: detail.message },
            };
      }),
    ).then((loaded) => {
      if (!cancelled) {
        setPreviews(Object.fromEntries(loaded.map((entry) => [entry.slug, entry.state])));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [row.slug, selectedSlugs]);

  const apply = useCallback(async () => {
    if (eligibilityDirty || busy) {
      return;
    }
    setBusy(true);
    setResults(null);
    const next = await placeReplicationsOnSubstances({
      substanceSlugs: selectedSlugs,
      replicationSlugs: [row.slug],
    });
    setResults(next);
    setBusy(false);
    if (next.some((result) => result.added.length > 0)) {
      onPlaced();
    }
  }, [busy, eligibilityDirty, onPlaced, row.slug, selectedSlugs]);

  return (
    <div className="theme-replication-association-row space-y-3 rounded-xl border px-3 py-3">
      <div className="space-y-1">
        <p className="theme-text-primary text-sm font-semibold">Add to drugs</p>
        <p className="theme-text-muted text-xs leading-5">
          Place this work directly on one or more drug galleries. This does not change its effect
          tags. Existing per-drug exclusions stay excluded.
        </p>
      </div>
      <SubstanceTargetPicker
        selectedSlugs={selectedSlugs}
        onSelectedSlugsChange={setSelectedSlugs}
        disabled={eligibilityDirty}
        busy={busy}
        label="Drugs to add this replication to"
      />
      {eligibilityDirty ? (
        <p className="theme-text-muted text-xs">
          Save eligibility or Discard before placing this work.
        </p>
      ) : null}
      {selectedSlugs.length > 0 ? (
        <ul aria-label="Placement preview" className="space-y-1.5">
          {selectedSlugs.map((substanceSlug) => {
            const result = results?.find((entry) => entry.substanceSlug === substanceSlug);
            const preview = previews[substanceSlug];
            const title =
              result?.substanceTitle
              ?? (preview?.status === "ready" ? preview.preflight.substanceTitle : substanceSlug);
            let state = "Checking…";
            if (result) {
              state =
                result.status === "conflict"
                  ? "Conflict — reload and try again"
                  : result.status === "error"
                    ? `Error — ${result.message ?? "save failed"}`
                    : result.added.includes(row.slug)
                      ? "Added"
                      : result.alreadyPresent.includes(row.slug)
                        ? "Already present"
                        : result.excluded.includes(row.slug)
                          ? "Excluded — preserved"
                          : result.ineligible.includes(row.slug)
                            ? "Ineligible for showcases"
                            : "No change";
            } else if (preview?.status === "error") {
              state = `Error — ${preview.message}`;
            } else if (preview?.status === "ready") {
              state = !isShowcaseEligible(row)
                ? "Ineligible for showcases"
                : preview.preflight.alreadyPresent.includes(row.slug)
                  ? "Already present"
                  : preview.preflight.excluded.includes(row.slug)
                    ? "Excluded — will stay excluded"
                    : "Ready to add";
            }
            return (
              <li
                key={substanceSlug}
                className="flex items-start justify-between gap-3 rounded-lg border border-[color:var(--editor-chip-border)] px-2.5 py-2 text-xs"
              >
                <span className="theme-text-primary font-medium">{title}</span>
                <span className="theme-text-muted text-right">{state}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="accent"
          size="sm"
          disabled={
            eligibilityDirty
            || busy
            || selectedSlugs.length === 0
            || selectedSlugs.some((slug) => !previews[slug] || previews[slug].status === "loading")
          }
          onClick={() => void apply()}
        >
          {busy ? "Adding…" : "Add to selected drugs"}
        </Button>
        <span className="theme-text-faint text-xs">Nothing is written until you add.</span>
      </div>
    </div>
  );
}

/**
 * The associated-drugs editor for one replication, mounted in the single-edit
 * drawer. Associations and direct placements are per replication, so a bulk
 * selection has no single answer.
 */
export function ReplicationAssociationsPanel({ row }: { row: StudioRow }) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [draft, setDraft] = useState<AssociationState>({ excluded: [] });
  const [saved, setSaved] = useState<AssociationState>({ excluded: [] });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [placementReloadPending, setPlacementReloadPending] = useState(false);

  const slug = row.slug;

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading" });
    setSaveState("idle");
    setFeedback(null);
    (async () => {
      let next: LoadState;
      try {
        const response = await fetch(`${ASSOCIATIONS_API}/${encodeURIComponent(slug)}`);
        if (response.ok) {
          const payload = (await response.json()) as { associations?: ReplicationAssociation[] };
          // A 200 without the array is a broken route, not an empty result:
          // rendering "appears nowhere" would be a lie about the data.
          next = Array.isArray(payload.associations)
            ? { status: "ready", rows: payload.associations }
            : {
                status: "error",
                message: "The associations endpoint returned no association list.",
              };
        } else {
          next = {
            status: "error",
            message: await readError(response, "Failed to load this replication's drug articles."),
          };
        }
      } catch {
        next = { status: "error", message: "Failed to reach the associations endpoint." };
      }
      if (cancelled) {
        return;
      }
      setLoad(next);
      if (next.status === "ready") {
        setDraft(associationStateOf(next.rows));
        setSaved(associationStateOf(next.rows));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, reloadToken]);

  const rows = useMemo(() => (load.status === "ready" ? load.rows : []), [load]);
  const summary = useMemo(() => summarizeAssociations(rows, draft), [rows, draft]);
  const excludedSet = useMemo(() => new Set(draft.excluded), [draft]);
  const atRiskSet = useMemo(
    () => new Set(summary.curatedAtRisk.map((entry) => entry.slug)),
    [summary],
  );
  const groups = useMemo(
    () =>
      [
        {
          key: "specific_drug" as const,
          caption: "Exact-drug placements",
          rows: rows.filter((entry) => entry.matchedVia === "specific_drug"),
        },
        {
          key: "drug_class" as const,
          caption: "General class placements",
          rows: rows.filter((entry) => entry.matchedVia === "drug_class"),
        },
        {
          key: "visual_disconnection" as const,
          caption: "Visual Disconnection fallback",
          rows: rows.filter((entry) => entry.matchedVia === "visual_disconnection"),
        },
        {
          key: "curated" as const,
          caption: "Direct associations",
          rows: rows.filter((entry) => entry.matchedVia === "curated"),
        },
      ].filter((group) => group.rows.length > 0),
    [rows],
  );
  const visibleRows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);

  const isDirty = !associationStatesEqual(draft, saved);
  const busy = saveState === "saving";

  useEffect(() => {
    if (!placementReloadPending || isDirty) {
      return;
    }
    setPlacementReloadPending(false);
    setReloadToken((token) => token + 1);
  }, [isDirty, placementReloadPending]);

  const mutate = useCallback((next: AssociationState) => {
    setDraft((current) => (next === current ? current : next));
    setSaveState("idle");
    setFeedback(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaveState("saving");
    setFeedback(null);
    const desired = [...draft.excluded];
    try {
      const response = await fetch(`${ASSOCIATIONS_API}/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedSubstanceSlugs: desired }),
      });
      if (!response.ok) {
        setSaveState("error");
        setFeedback({
          tone: "danger",
          message: await readError(response, "Saving the drug associations failed."),
        });
        return;
      }
      const echo = (await response.json()) as {
        updated?: string[];
        droppedCuratedPositions?: DroppedPosition[];
      };
      const desiredSet = new Set(desired);
      const written = Array.isArray(echo.updated) ? echo.updated : [];
      const dropped = Array.isArray(echo.droppedCuratedPositions) ? echo.droppedCuratedPositions : [];
      const droppedSet = new Set(dropped.map((entry) => entry.substance_slug));
      // The route echoes what it wrote rather than the rows; the desired set is
      // authoritative for `excluded`, and a dropped position is a real
      // un-curation, so the baseline has to forget it too.
      setLoad((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              rows: current.rows.map((entry) => ({
                ...entry,
                excluded: desiredSet.has(entry.slug),
                curatedPosition: droppedSet.has(entry.slug) ? null : entry.curatedPosition,
              })),
            }
          : current,
      );
      setSaved({ excluded: desired });
      setSaveState("saved");
      const base = `Saved eligibility. Allowed on ${rows.length - desiredSet.size} of ${rows.length} drug ${plural(rows.length, "article", "articles")} (${written.length} ${plural(written.length, "article", "articles")} rewritten).`;
      setFeedback({
        tone: dropped.length > 0 ? "warning" : "success",
        message:
          dropped.length > 0
            ? `${base} Dropped ${dropped.length} curated ${plural(dropped.length, "position", "positions")}: ${dropped
                .map(
                  (entry) =>
                    `${rows.find((candidate) => candidate.slug === entry.substance_slug)?.title ?? entry.substance_slug} (position ${entry.position})`,
                )
                .join(", ")}.`
            : base,
      });
    } catch {
      setSaveState("error");
      setFeedback({ tone: "danger", message: "Saving failed: the associations endpoint is unreachable." });
    }
  }, [draft, rows, slug]);

  const heading = `Showing on ${summary.published} of ${rows.length} drug ${plural(rows.length, "article", "articles")}`;

  return (
    <EditorSection
      headingLevel="h3"
      icon="lucide:link"
      title={load.status === "ready" ? heading : "Drug articles"}
      description="Reviewed title taxonomy assigns exact-drug and permitted general-class placements automatically. A checked association is published; untick it to add a per-article exclusion. Direct associations do not mutate effect tags."
      actions={
        load.status === "ready" && rows.length > 0 ? (
          <EditorStatusPill tone={summary.excluded > 0 ? "info" : "neutral"}>
            {`${summary.showing} showing · ${summary.excluded} excluded`}
          </EditorStatusPill>
        ) : null
      }
    >
      <div className="space-y-4">
        <DirectPlacementEditor
          row={row}
          eligibilityDirty={isDirty}
          onPlaced={() => setPlacementReloadPending(true)}
        />
      {load.status === "loading" ? (
        <AssociationsSkeleton />
      ) : load.status === "error" ? (
        <EmptyStateSurface padding="sm" radius="lg" tone="danger" className="space-y-2 text-sm">
          <p className="theme-text-primary">{load.message}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            <Icon icon="lucide:refresh-cw" size={14} />
            Retry
          </Button>
        </EmptyStateSurface>
      ) : rows.length === 0 ? (
        <EmptyStateSurface padding="sm" radius="lg" className="space-y-1.5 text-sm">
          <p className="theme-text-primary font-medium">
            This replication does not appear on any drug article yet
          </p>
          <p className="theme-text-muted">
            An owning effect, effect tag, or drug name in the title can derive an eligible
            association. Direct placement can pin this work without changing any effect data.
            Choose drugs above to add it explicitly.
          </p>
        </EmptyStateSurface>
      ) : (
        <div className="space-y-3">
          <EditorToolbar variant="split" label="Drug association actions">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="accent" size="sm" disabled={!isDirty || busy} onClick={() => void handleSave()}>
                Save eligibility
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!isDirty || busy}
                onClick={() => {
                  setDraft({ excluded: [...saved.excluded] });
                  setSaveState("idle");
                  setFeedback(null);
                }}
              >
                Discard
              </Button>
              <EditorActionGroup label="Selection" separatorBefore>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => mutate(setAllAssociations(draft, visibleRows, false))}
                >
                  Allow all shown
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => mutate(setAllAssociations(draft, visibleRows, true))}
                >
                  Exclude all shown
                </Button>
              </EditorActionGroup>
            </div>
            {saveState === "saving" || saveState === "error" ? (
              <EditorActionStatus status={saveState} />
            ) : (
              <EditorStatusPill tone={isDirty ? "warning" : "neutral"}>
                {isDirty ? "Unsaved changes" : "Associations saved"}
              </EditorStatusPill>
            )}
          </EditorToolbar>

          {isDirty && summary.curatedAtRisk.length > 0 ? (
            <ActionNotice tone="warning">
              {`Saving will drop ${summary.curatedAtRisk.length} curated ${plural(summary.curatedAtRisk.length, "position", "positions")}: ${summary.curatedAtRisk
                .map((entry) => `${entry.title} (position ${entry.curatedPosition})`)
                .join(", ")}. Those drugs pinned this replication, so excluding it also un-curates it.`}
            </ActionNotice>
          ) : null}

          {feedback ? (
            <ActionNotice tone={feedback.tone} onDismiss={() => setFeedback(null)}>
              {feedback.message}
            </ActionNotice>
          ) : null}

          {groups.map((group) => (
            <div key={group.key} className="space-y-2">
              <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.24em]">
                {group.caption}
              </p>
              <ul aria-label={group.caption} className="space-y-2">
                {group.rows.map((entry) => (
                  <AssociationRow
                    key={entry.slug}
                    row={entry}
                    checked={!excludedSet.has(entry.slug)}
                    atRisk={atRiskSet.has(entry.slug)}
                    disabled={busy}
                    onToggle={() => mutate(toggleAssociation(draft, entry.slug))}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      </div>
    </EditorSection>
  );
}
