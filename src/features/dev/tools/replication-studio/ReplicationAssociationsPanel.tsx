"use client";

/**
 * Replication → drug association editor — `/dev` → Replications → one selected
 * replication → "Showing on N of M drug articles".
 *
 * A replication is never linked to a substance directly: the showcase derives
 * the link from the substance's visual effects, either through this
 * replication's owning `effect_slug` or one of its `effect_tags`. So there is
 * nothing here to "unlink" — the one way to break a single association is that
 * substance's `substanceGalleries.removed_slugs`, which is exactly what
 * unticking a row writes. This is the Substances portal's exclusion data seen
 * from the replication's side: unticking a drug touches that drug only, and
 * never strips a tag from the replication itself.
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

import type { StudioRow } from "./replicationStudioModel";
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
  effect_slug: "via owning effect",
  effect_tags: "via effect tag",
};

/**
 * What one row means on the drug it names. A tick is only eligibility: the drug
 * is allowed to show this replication, and shows it once curated there. So the
 * draft's exclusion decides first, and curation decides whether the remainder
 * is actually on the article.
 */
type RowState = "published" | "eligible" | "excluded";

const ROW_STATE_TONE: Record<RowState, "success" | "neutral" | "danger"> = {
  published: "success",
  eligible: "neutral",
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
  // Exclusion decides first; curation decides whether the remainder is on the article.
  const state: RowState = !checked
    ? "excluded"
    : row.curatedPosition === null
      ? "eligible"
      : "published";

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
              ? `Showing · position ${row.curatedPosition}`
              : state === "eligible"
                ? "Eligible · not curated"
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
              curated at position {row.curatedPosition} — unticking drops that position
            </span>
          </p>
        ) : null}
        {state === "eligible" ? (
          <p
            className="theme-text-faint mt-1.5 flex items-start gap-1.5 pl-[1.625rem] text-xs leading-5"
            data-testid={`eligible-note-${row.slug}`}
          >
            <Icon icon="lucide:eye-off" size={13} className="mt-0.5 shrink-0" />
            <span>
              nothing shows on this drug yet — unticking only forbids a future curation
            </span>
          </p>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The associated-drugs editor for exactly one replication. Mounted by the
 * studio's editor drawer in single-edit mode only: associations are derived per
 * replication, so a bulk selection has no single answer to show.
 */
export function ReplicationAssociationsPanel({ row }: { row: StudioRow }) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [draft, setDraft] = useState<AssociationState>({ excluded: [] });
  const [saved, setSaved] = useState<AssociationState>({ excluded: [] });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

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
          key: "effect_slug" as const,
          caption: "Matched by owning effect",
          rows: rows.filter((entry) => entry.matchedVia === "effect_slug"),
        },
        {
          key: "effect_tags" as const,
          caption: "Matched by effect tag",
          rows: rows.filter((entry) => entry.matchedVia === "effect_tags"),
        },
      ].filter((group) => group.rows.length > 0),
    [rows],
  );

  const isDirty = !associationStatesEqual(draft, saved);
  const busy = saveState === "saving";

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
      const base = `Saved. This replication now appears on ${rows.length - desiredSet.size} of ${rows.length} drug ${plural(rows.length, "article", "articles")} (${written.length} ${plural(written.length, "article", "articles")} rewritten).`;
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

  // The primary number is what a reader actually sees. `summary.showing` is only
  // eligibility, so it rides in the pill beside the exclusions instead.
  const heading = `Showing on ${summary.published} of ${rows.length} drug ${plural(rows.length, "article", "articles")}`;

  return (
    <EditorSection
      headingLevel="h3"
      icon="lucide:link"
      title={load.status === "ready" ? heading : "Drug articles"}
      description="Derived from each drug's visual effects — this replication's owning effect, or one of its effect tags. A drug shows this work only once it has been curated on that drug's board, so a tick here means eligible, not published. Unticking a drug excludes it from that drug's showcase only; the replication's tags are untouched."
      actions={
        load.status === "ready" && rows.length > 0 ? (
          <EditorStatusPill tone={summary.excluded > 0 ? "info" : "neutral"}>
            {`${summary.showing} eligible · ${summary.excluded} excluded`}
          </EditorStatusPill>
        ) : null
      }
    >
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
            A drug article surfaces a replication when the replication&rsquo;s owning effect, or one
            of its effect tags, is one of that drug&rsquo;s visual subjective effects. Give it an
            owning effect or tag it above and it will appear on every drug that lists that effect.
          </p>
        </EmptyStateSurface>
      ) : (
        <div className="space-y-3">
          <EditorToolbar variant="split" label="Drug association actions">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="accent" size="sm" disabled={!isDirty || busy} onClick={() => void handleSave()}>
                Save
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
                  onClick={() => mutate(setAllAssociations(draft, rows, false))}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => mutate(setAllAssociations(draft, rows, true))}
                >
                  Select none
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
    </EditorSection>
  );
}
