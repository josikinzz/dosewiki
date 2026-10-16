"use client";

import { useId, useMemo, useState, type ReactNode, type RefObject } from "react";

import { ExpandIndicator } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import {
  EditorCheckbox,
  EditorField,
  EditorPanel,
  EditorStatusPill,
  Notice,
  type SearchablePickerOption,
} from "@/features/dev/components";
import { SearchablePicker } from "@/features/dev/components/SearchablePicker";
import { cn } from "@/lib/utils";
import { publicHref } from "@/utils/publicHref";
import type { TripReportEditableFields } from "../../../../../server/lib/tripReportEditing";
import { PortalReportTimelineEditor } from "./PortalReportTimelineEditor";
import { SubstancesField, TripDetailsFields } from "./ReportFields";
import { ReportTagsField } from "./ReportTagsField";
import type { PortalContributorOption, PortalRow } from "./tripReportPortalModel";
import type { PortalNotice, PortalPendingAction } from "./useTripReportPortalController";

export type ReportAttribution = {
  profileKey: string | null;
  confirmAuthorNameClaim: boolean;
};

export function PortalReportPane({
  row,
  saved,
  draft,
  attribution,
  onAttributionChange,
  contributors,
  dirty,
  pending,
  busy,
  saveKeyLabel,
  notice,
  onDismissNotice,
  onLoadLatest,
  onChange,
  onSave,
  onDiscard,
  onDelete,
  onClose,
  onBackToList,
  headingRef,
  position,
  onMove,
  hiddenByList,
  saveLine,
}: {
  row: PortalRow;
  saved: TripReportEditableFields;
  draft: TripReportEditableFields;
  attribution: ReportAttribution;
  onAttributionChange: (next: ReportAttribution) => void;
  contributors: readonly PortalContributorOption[];
  dirty: boolean;
  pending: PortalPendingAction | null;
  busy: boolean;
  saveKeyLabel: string;
  notice: PortalNotice | null;
  onDismissNotice: () => void;
  onLoadLatest: () => void;
  onChange: (next: TripReportEditableFields) => void;
  onSave: () => void;
  onDiscard: () => void;
  onDelete: () => void;
  onClose: () => void;
  onBackToList: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
  position: { index: number; total: number } | null;
  onMove: (direction: -1 | 1) => void;
  hiddenByList: ReactNode;
  saveLine: ReactNode;
}) {
  const headingId = useId();
  const liveHref = row.publicSlug ? publicHref.report(row.publicSlug) : null;
  const contributorOptions = useMemo<SearchablePickerOption[]>(() => {
    const byKey = new Map<string, SearchablePickerOption>();
    for (const contributor of contributors) {
      if (!byKey.has(contributor.key)) {
        byKey.set(contributor.key, { value: contributor.key, label: contributor.displayName, hint: contributor.key });
      }
    }
    return [...byKey.values()];
  }, [contributors]);
  const nameOfProfile = (key: string | null) =>
    key ? contributors.find((contributor) => contributor.key === key)?.displayName ?? key : null;
  const profileValue = attribution.profileKey ?? row.profileKey ?? "";
  const bylineMoved = draft.subject.name.trim().toLowerCase() !== saved.subject.name.trim().toLowerCase();
  const bylineMatch = useMemo(() => {
    const name = draft.subject.name.trim().toLowerCase();
    return name ? contributors.find((contributor) => contributor.displayName.trim().toLowerCase() === name) ?? null : null;
  }, [contributors, draft.subject.name]);
  const claimAt = bylineMoved && bylineMatch && profileValue !== bylineMatch.key;

  function patch(next: Partial<TripReportEditableFields>) {
    onChange({ ...draft, ...next });
  }

  const pager = position ? (
    <div className="flex items-center gap-1">
      <span className="theme-text-muted px-1 text-xs tabular-nums">
        {position.index + 1} of {position.total}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("size-8", TOUCH_ICON)}
        aria-label="Previous in list"
        aria-keyshortcuts="k"
        title="Previous in list (k)"
        disabled={position.index <= 0}
        onClick={() => onMove(-1)}
      >
        <Icon icon="lucide:chevron-up" size={16} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("size-8", TOUCH_ICON)}
        aria-label="Next in list"
        aria-keyshortcuts="j"
        title="Next in list (j)"
        disabled={position.index >= position.total - 1}
        onClick={() => onMove(1)}
      >
        <Icon icon="lucide:chevron-down" size={16} />
      </Button>
    </div>
  ) : null;

  return (
    <EditorPanel className="overflow-visible" role="region" aria-labelledby={headingId}>
      <header className="theme-portal-rule relative space-y-3 border-b px-4 py-3.5 sm:px-5">
        <Button
          type="button"
          variant="iconGhost"
          size="icon"
          className={cn("absolute right-2 top-2 sm:right-3", TOUCH_ICON)}
          onClick={onClose}
          aria-label="Close editor"
          title="Close editor (Esc)"
        >
          <Icon icon="lucide:x" size={18} />
        </Button>
        <div className="flex items-center justify-between gap-2 pr-10 lg:hidden">
          <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBackToList}>
            <Icon icon="lucide:arrow-left" size={14} />
            Back to list
          </Button>
          {pager}
        </div>
        <div className="flex items-start justify-between gap-3 lg:pr-10">
          <h3
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className="theme-accent-heading min-w-0 break-words text-xl font-semibold leading-tight outline-none"
          >
            <span className="sr-only">Editing </span>
            {saved.title || "Untitled report"}
          </h3>
          <div className="-mt-1 hidden shrink-0 lg:block">{pager}</div>
        </div>
        <div className="theme-text-muted flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
          <EditorStatusPill inline tone="success">
            Published
          </EditorStatusPill>
          {liveHref ? (
            <a
              href={liveHref}
              target="_blank"
              rel="noreferrer"
              className="theme-focus-ring theme-accent-underline inline-flex min-h-11 items-center gap-1.5 rounded-control font-medium text-dose-accent-strong underline-offset-4 hover:underline sm:min-h-0"
            >
              View live
              <span className="sr-only">{`: ${liveHref}, opens in a new tab`}</span>
              <Icon icon="lucide:arrow-up-right" size={14} />
            </a>
          ) : null}
          {liveHref ? (
            <span aria-hidden className="theme-text-faint break-all text-xs">
              {liveHref}
            </span>
          ) : null}
        </div>
        <p className="theme-text-muted text-sm">
          {row.profileKey ? `Attributed to ${nameOfProfile(row.profileKey)}` : "No contributor profile"}
          {row.license ? ` · Licence ${row.license === "author-retained" ? "retained by the author" : row.license}` : ""}
        </p>
        {hiddenByList ? <div className="theme-text-muted text-sm">{hiddenByList}</div> : null}
      </header>

      <div className="space-y-8 px-4 py-5 sm:px-5 [&_:is(input,button,textarea)]:scroll-mb-44 [&_:is(input,button,textarea)]:scroll-mt-28">
        <EditorField htmlFor="portal-report-title" label="Title">
          <Input
            id="portal-report-title"
            value={draft.title}
            onChange={(event) => patch({ title: event.target.value })}
            className="font-semibold"
          />
        </EditorField>

        <fieldset className="min-w-0 space-y-4">
          <legend className="theme-accent-heading mb-3 text-sm font-semibold">Byline and attribution</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <EditorField
              htmlFor="portal-report-author"
              label="Byline"
              description="The name the page shows. Suggestions are contributor names."
            >
              <Input
                id="portal-report-author"
                list="portal-contributor-options"
                value={draft.subject.name}
                onChange={(event) => patch({ subject: { ...draft.subject, name: event.target.value } })}
              />
            </EditorField>
            <datalist id="portal-contributor-options">
              {contributors.map((option) => (
                <option key={`${option.key}-${option.displayName}`} value={option.displayName} />
              ))}
            </datalist>
            <EditorField
              label="Contributor profile"
              description="Links the report to a contributor's page. Empty means no attribution."
            >
              {(controlProps) => (
                <SearchablePicker
                  id={controlProps.id}
                  ariaLabel="Contributor profile"
                  options={contributorOptions}
                  value={profileValue || null}
                  placeholder="No contributor profile"
                  emptyText="No contributor matches."
                  onChange={(next) => onAttributionChange({ ...attribution, profileKey: next ?? "" })}
                />
              )}
            </EditorField>
          </div>
          {claimAt && bylineMatch ? (
            <div className="space-y-2 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] px-3 py-2.5">
              <p className="theme-text-secondary max-w-[65ch] text-sm">
                “{bylineMatch.displayName}” is a contributor’s name, so a save is refused until you choose: attribute
                the report to them, or keep the byline without attribution.
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onAttributionChange({ profileKey: bylineMatch.key, confirmAuthorNameClaim: false })}
                >
                  Attribute to {bylineMatch.displayName}
                </Button>
              </div>
            </div>
          ) : null}
          {bylineMoved ? (
            <EditorCheckbox
              checked={attribution.confirmAuthorNameClaim}
              onChange={(event) => onAttributionChange({ ...attribution, confirmAuthorNameClaim: event.target.checked })}
              label="Keep the byline without attribution, even though it matches a contributor"
            />
          ) : null}
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="theme-accent-heading mb-3 text-sm font-semibold">The trip</legend>
          <TripDetailsFields subject={draft.subject} onChange={(next) => patch({ subject: { ...draft.subject, ...next } })} />
        </fieldset>

        <ReportTagsField tags={draft.tags} onChange={(tags) => patch({ tags })} />

        <SubstancesField substances={draft.substances} onChange={(substances) => patch({ substances })} />

        <fieldset className="min-w-0 space-y-3">
          <legend className="theme-accent-heading text-sm font-semibold">Report body</legend>
          <p className="theme-text-muted -mt-1 text-sm">
            Introduction, the three timeline phases and the conclusion, in reading order. Empty parts are left out of the
            page.
          </p>
          <PortalReportTimelineEditor draft={draft} onChange={onChange} />
        </fieldset>

        <DeleteReport
          key={row.id}
          slug={row.publicSlug ?? ""}
          title={saved.title}
          dirty={dirty}
          busy={busy}
          deleting={pending === "delete"}
          onDelete={onDelete}
        />
      </div>

      <footer
        aria-label="Save"
        className="theme-portal-rule sticky bottom-0 z-10 space-y-2.5 rounded-b-[inherit] border-t bg-[var(--editor-panel-bg)]/95 px-4 py-3 backdrop-blur sm:px-5"
      >
        {notice ? (
          <Notice
            placement="inline"
            tone={notice.tone}
            title={notice.title}
            dismiss={onDismissNotice}
            actions={
              notice.kind === "conflict" ? (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onLoadLatest}>
                  {pending === "latest" ? "Loading" : "Load the latest version"}
                </Button>
              ) : undefined
            }
          >
            {notice.message}
          </Notice>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={busy || !dirty}
            aria-busy={pending === "save" || undefined}
            aria-keyshortcuts="Meta+S Control+S"
            onClick={onSave}
          >
            {pending === "save" ? "Publishing" : "Save"}
            <span aria-hidden className="[@media(pointer:coarse)]:hidden">
              <kbd className="theme-dev-kbd !text-current opacity-70">{saveKeyLabel}</kbd>
            </span>
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={busy || !dirty} onClick={onDiscard}>
            Discard edits
          </Button>
          <p aria-live="polite" className={cn("flex min-w-0 items-center gap-2 text-xs", dirty ? "theme-text-secondary" : "theme-text-faint")}>
            {pending === "save" ? (
              "Publishing your changes"
            ) : dirty ? (
              <>
                <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 shrink-0 rounded-full" />
                Unsaved changes
              </>
            ) : (
              "No changes yet"
            )}
          </p>
          <span className="min-w-0 sm:ml-auto">{saveLine}</span>
        </div>
      </footer>
    </EditorPanel>
  );
}

function DeleteReport({
  slug,
  title,
  dirty,
  busy,
  deleting,
  onDelete,
}: {
  slug: string;
  title: string;
  dirty: boolean;
  busy: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const regionId = useId();
  const inputId = useId();
  const matches = typed.trim() === slug;

  return (
    <section className="theme-portal-rule border-t pt-5">
      <h4>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => setOpen((current) => !current)}
          className={cn(
            "theme-focus-ring flex min-h-11 w-full items-center justify-between gap-3 rounded-control text-left text-sm font-semibold",
            open ? "theme-danger-text" : "theme-text-secondary",
          )}
        >
          <span className="flex items-center gap-2">
            <Icon icon="lucide:trash-2" size={15} className="shrink-0" />
            Delete this report
          </span>
          <ExpandIndicator isExpanded={open} variant="inline" />
        </button>
      </h4>
      <div id={regionId} hidden={!open} className="mt-3 space-y-3">
        <p className="theme-text-secondary max-w-[65ch] text-sm">
          This removes “{title}” and its page at /reports/{slug} for good. There is no undo, and links to it stop
          working.{dirty ? " Your unsaved edits go with it." : ""}
        </p>
        <EditorField
          htmlFor={inputId}
          label={`Type ${slug} to confirm`}
          description={typed && !matches ? "That does not match." : undefined}
        >
          <Input
            id={inputId}
            aria-label="Type the report slug to confirm deletion"
            value={typed}
            autoComplete="off"
            spellCheck={false}
            className="max-w-sm font-mono"
            aria-invalid={typed && !matches ? true : undefined}
            onChange={(event) => setTyped(event.target.value)}
          />
        </EditorField>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy || !matches}
            aria-busy={deleting || undefined}
            onClick={onDelete}
          >
            {deleting ? "Deleting" : "Delete report"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false);
              setTyped("");
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    </section>
  );
}
