"use client";

/**
 * My reports: `/dev/my-reports`. The published trip reports the signed-in
 * member owns, each openable in a content editor, and the status of the trip
 * reports they submitted with this account's email.
 *
 * Contributor floor. The editor is deliberately narrower than the portal's:
 * title, tags, and the report body (introduction, the three timelines, the
 * conclusion). Byline, attribution, trip subject, substances and the slug are
 * editor decisions and stay on the portal; Postgres refuses them from an owner
 * regardless of what this form sends. Nothing here deletes.
 *
 * Layout follows the Inbox's workspace: the list of reports on the left (sticky
 * on desktop), the open report in a docked pane on the right with its save
 * dock at the bottom, so the result of a save shows beside Save. On a phone
 * the pane stacks under the list, opening a report scrolls it in, and the pane
 * carries Back to list.
 */

import { DevToolSection } from "@/features/dev/pages/DevToolSection";
import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  EditorPanel,
  LoadErrorState,
  Notice,
  SaveLine,
  useConfirm,
  useDevShortcuts,
  useDirtyGuard,
  useScrollToDetail,
  useUnsavedWork,
  type NoticeMessage,
} from "@/features/dev/components";
import { cn } from "@/lib/utils";
import type { TripReportEditableFields } from "../../../../../server/lib/tripReportEditing";
import { useModifierKeyLabel } from "../../pages/DevCommandPalette";
import { LINK_LIST_CLASS, OnwardLink, RelativeDay, RowSkeletons, SectionNote } from "../home/homeParts";
import { countNoun } from "../home/homeModel";
import { AssignOwnerSection } from "./AssignOwnerSection";
import {
  changedParts,
  fetchOwnedRecord,
  fetchOwnedReports,
  formatTripDate,
  isRevisionConflict,
  isWriteFreezeRefusal,
  joinParts,
  saveOwnedReport,
  sortOwnedReports,
  type OwnedReportRecord,
  type OwnedReportRow,
} from "./myReportsModel";
import { OwnedReportPane, type OpenReport } from "./OwnedReportPane";
import { MY_REPORTS_EMPTY_DESCRIPTION } from "./ownershipCopy";
import { SUBMISSIONS_SECTION_ID, SubmissionsSection } from "./SubmissionsSection";

const DISCARD_COPY = {
  title: "Discard your edits?",
  description: "This report has changes that were not saved. Discarding them leaves the live page as it is now.",
};

const SAVE_SHORTCUTS = [{ keys: "Cmd+S", label: "Save and publish the open report" }] as const;

export function MyReportsTab({ canApprove = false }: { canApprove?: boolean }) {
  const [rows, setRows] = useState<OwnedReportRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [open, setOpen] = useState<OpenReport | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** The result of opening a report: shown at the list, where the tap happened. */
  const [listNotice, setListNotice] = useState<NoticeMessage | null>(null);
  /** The result of the last save: shown in the pane's dock, beside Save. */
  const [saveNotice, setSaveNotice] = useState<NoticeMessage | null>(null);
  const listRef = useRef<HTMLElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const paneTitleRef = useRef<HTMLHeadingElement>(null);
  const saveKeyLabel = useModifierKeyLabel("S");
  /** Set when a row opens a report, so the pane's heading takes focus once it has rendered. */
  const focusPaneOnOpen = useRef(false);

  const dirty = open !== null && JSON.stringify(open.draft) !== JSON.stringify(open.record.fields);
  // The in-tool guard keeps row clicks and Close; the shell owns rail clicks,
  // Leave and unload. Saving republishes the page, so the shell only discards.
  const { guard, dialog: discardDialog } = useDirtyGuard(dirty, { ...DISCARD_COPY, warnOnUnload: false });
  useUnsavedWork({
    kind: "discard-only",
    because: "This change would go live. Publish it from the tool; leaving here never publishes.",
    id: "my-reports:report",
    tab: "my-reports",
    label: `My reports: edits to /reports/${open?.record.slug ?? ""}`,
    dirty,
    discard: () => setOpen((current) => (current ? { ...current, draft: current.record.fields } : current)),
  });
  const { confirm, dialog: confirmDialog } = useConfirm();
  useScrollToDetail(paneRef, open?.record.id ?? null);
  // Name the report for keyboard and screen reader users once its pane is in the page;
  // on phones the pane scrolls itself in. An effect, not a frame later, so a click
  // that lands in a field right after cannot lose its focus to the heading.
  const openId = open?.record.id ?? null;
  useEffect(() => {
    if (openId === null || !focusPaneOnOpen.current) return;
    focusPaneOnOpen.current = false;
    paneTitleRef.current?.focus({ preventScroll: true });
  }, [openId]);
  useDevShortcuts(SAVE_SHORTCUTS, open !== null);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      setRows(await fetchOwnedReports());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load your reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = () => {
    void load();
    setReloadToken((token) => token + 1);
  };

  const focusRow = (id: string | undefined) => {
    if (!id) return;
    listRef.current?.querySelector<HTMLElement>(`[data-report-id="${CSS.escape(id)}"] button`)?.focus({ preventScroll: true });
  };

  const openReport = async (row: OwnedReportRow) => {
    setOpeningId(row.id);
    setListNotice(null);
    setSaveNotice(null);
    try {
      const record = await fetchOwnedRecord(row.id);
      focusPaneOnOpen.current = true;
      setOpen({ record, draft: record.fields });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to open that report.";
      setListNotice({ tone: "danger", message: `Could not open ${row.title}. ${message}` });
      // A report that is gone should leave the list, so read it again.
      if (/no longer exists|not found/i.test(message)) void load();
    } finally {
      setOpeningId(null);
    }
  };

  const save = async () => {
    if (!open) {
      return;
    }
    setSaving(true);
    setSaveNotice(null);
    try {
      const saved = await saveOwnedReport(open.record.id, open.record.fields, open.draft, open.record.revision);
      const record: OwnedReportRecord = { ...open.record, ...saved };
      setOpen({ record, draft: saved.fields });
      setRows((current) =>
        current?.map((row) =>
          row.id === open.record.id
            ? { ...row, slug: saved.slug, title: saved.fields.title, tripDate: saved.fields.subject.trip_date }
            : row,
        ) ?? current,
      );
      setSaveNotice({ tone: "success", message: `Saved /reports/${saved.slug}. The live page shows your changes now.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The save did not go through.";
      if (isWriteFreezeRefusal(message)) {
        setSaveNotice({
          tone: "danger",
          message: "Writes are paused, so your changes were not published. They are still here; save again once writes resume.",
        });
      } else if (isRevisionConflict(message)) {
        setSaveNotice({
          tone: "danger",
          title: "Someone saved this report after you opened it.",
          message: `${message} Copy anything you want to keep, then load the latest version.`,
          actions: (
            <Button type="button" variant="outline" size="sm" onClick={() => askReloadLatest(open.record.id)}>
              Load the latest version
            </Button>
          ),
        });
      } else {
        setSaveNotice({ tone: "danger", message });
      }
    } finally {
      setSaving(false);
    }
  };

  const askReloadLatest = (id: string) => {
    confirm({
      title: "Load the latest version?",
      description: "Your edits here are dropped and the editor shows the report as it is live now. Copy anything you want to keep first.",
      confirmLabel: "Load latest",
      destructive: true,
      onConfirm: async () => {
        const record = await fetchOwnedRecord(id);
        setOpen({ record, draft: record.fields });
        setSaveNotice({ tone: "info", message: "Loaded the latest version. Apply your edits again, then save." });
      },
    });
  };

  const confirmSave = () => {
    if (!open || saving) {
      return;
    }
    const parts = joinParts(changedParts(open.record.fields, open.draft));
    confirm({
      title: `Publish to /reports/${open.record.slug}?`,
      description: `${parts ? `You changed ${parts}. ` : ""}Saving replaces the live page right away, and readers see it as soon as it saves.`,
      confirmLabel: "Save and publish",
      onConfirm: save,
    });
  };

  // Cmd+S or Ctrl+S asks to publish the open report; it never saves without the confirm.
  const confirmSaveRef = useRef(confirmSave);
  confirmSaveRef.current = confirmSave;
  const canSave = open !== null && dirty && !saving;
  useEffect(() => {
    if (open === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (canSave && !document.querySelector('[role="dialog"], [role="alertdialog"]')) confirmSaveRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, canSave]);

  const closeEditor = () =>
    guard(() => {
      const id = open?.record.id;
      setOpen(null);
      setSaveNotice(null);
      requestAnimationFrame(() => focusRow(id));
    });

  const backToList = () => {
    listRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    focusRow(open?.record.id);
  };

  const hasRows = rows !== null && rows.length > 0;
  // A member who owns nothing yet leads with their submissions, the part that moves.
  const submissionsFirst = rows !== null && rows.length === 0 && !loadError;
  const ownedSlugs = new Set((rows ?? []).map((row) => row.slug));
  const editOwned = (slug: string) => {
    const row = rows?.find((candidate) => candidate.slug === slug);
    if (!row) return;
    listRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    if (open?.record.id !== row.id) guard(() => void openReport(row));
  };
  const submissions = <SubmissionsSection reloadToken={reloadToken} ownedSlugs={ownedSlugs} onEditOwned={editOwned} />;

  return (
    <div className="space-y-12">
      {submissionsFirst ? submissions : null}

      <DevToolSection
        tool="my-reports"
        description="Your published trip reports. Open one to revise its title, tags or body."
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={loading}
            aria-busy={loading || undefined}
          >
            <Icon icon="lucide:refresh-cw" size={14} className={cn(loading && "motion-safe:animate-spin")} />
            {loading && rows !== null ? "Refreshing" : "Refresh"}
          </Button>
        }
      >
        {loadError ? (
          <LoadErrorState what="your reports" message={loadError} onRetry={() => void load()} busy={loading} />
        ) : rows === null ? (
          <RowSkeletons rows={3} label="your reports" />
        ) : rows.length === 0 ? (
          <div className="max-w-3xl space-y-1">
            <SectionNote icon="lucide:notebook">
              <span className="theme-text-secondary block font-medium">No reports yet</span>
              <span className="block">{MY_REPORTS_EMPTY_DESCRIPTION}</span>
            </SectionNote>
            <OnwardLink href={`#${SUBMISSIONS_SECTION_ID}`}>See your submissions</OnwardLink>
          </div>
        ) : null}

        {hasRows ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] lg:items-start xl:gap-8">
            <section ref={listRef} aria-labelledby="my-reports-published" className="scroll-mt-24 space-y-3 lg:sticky lg:top-24">
              <div className="flex items-center justify-between gap-3">
                <h3 id="my-reports-published" className="type-meta-label theme-text-muted">
                  Published
                </h3>
                <p className="theme-text-muted text-xs tabular-nums">{countNoun(rows.length, "report")}</p>
              </div>
              {listNotice ? <Notice {...listNotice} dismiss={() => setListNotice(null)} /> : null}
              <ul aria-label="Your published reports" className={LINK_LIST_CLASS}>
                {sortOwnedReports(rows).map((row) => (
                  <li key={row.id} data-report={row.slug} data-report-id={row.id}>
                    <ReportRow
                      row={row}
                      isOpen={open?.record.id === row.id}
                      isDirty={open?.record.id === row.id && dirty}
                      opening={openingId === row.id}
                      disabled={openingId !== null}
                      onOpen={() => (open?.record.id === row.id ? paneTitleRef.current?.focus() : guard(() => void openReport(row)))}
                    />
                  </li>
                ))}
              </ul>
            </section>

            <section
              ref={paneRef}
              aria-label={open ? `Editor: ${open.record.fields.title}` : "Editor"}
              className={cn("scroll-mt-24", !open && "hidden lg:block")}
            >
              {open ? (
                <OwnedReportPane
                  key={open.record.id}
                  open={open}
                  dirty={dirty}
                  saving={saving}
                  saveKeyLabel={saveKeyLabel}
                  notice={saveNotice}
                  onDismissNotice={() => setSaveNotice(null)}
                  onChange={(draft: TripReportEditableFields) => setOpen({ ...open, draft })}
                  onRevert={() => setOpen({ ...open, draft: open.record.fields })}
                  onSave={confirmSave}
                  onClose={closeEditor}
                  onBackToList={backToList}
                  titleRef={paneTitleRef}
                  saveLine={<SaveLine model="instant" />}
                />
              ) : (
                <IdlePane />
              )}
            </section>
          </div>
        ) : null}
      </DevToolSection>

      {submissionsFirst ? null : submissions}

      {canApprove ? <AssignOwnerSection onAssigned={() => void load()} /> : null}

      {discardDialog}
      {confirmDialog}
    </div>
  );
}

/** What the pane says on desktop before a report is open. Hidden on phones, where the list is the whole view. */
function IdlePane() {
  return (
    <EditorPanel variant="subtle" className="space-y-3 px-5 py-6">
      <p className="theme-text-primary flex items-center gap-2 text-base font-semibold">
        <Icon icon="lucide:pencil-line" size={18} className="theme-icon-accent shrink-0" />
        Pick a report to edit
      </p>
      <p className="theme-text-muted max-w-[60ch] text-sm">
        Its title, tags and body open here. You confirm each save, and the live page changes as soon as it lands.
      </p>
      <SaveLine model="instant" />
    </EditorPanel>
  );
}

function ReportRow({
  row,
  isOpen,
  isDirty,
  opening,
  disabled,
  onOpen,
}: {
  row: OwnedReportRow;
  isOpen: boolean;
  isDirty: boolean;
  opening: boolean;
  disabled: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={isOpen ? "true" : undefined}
      aria-busy={opening || undefined}
      disabled={disabled}
      onClick={onOpen}
      className={cn(
        "theme-dev-link-row group flex min-h-11 w-full items-center gap-3 rounded-control px-2.5 py-2.5 text-left text-sm transition-colors disabled:cursor-wait motion-reduce:transition-none",
        isOpen && "theme-dev-link-lead",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="theme-text-primary line-clamp-2 break-words font-medium">{row.title}</span>
        <span className="theme-text-faint mt-0.5 block truncate font-mono text-xs">
          <span className="sr-only">, </span>/reports/{row.slug}
        </span>
        <span className="theme-text-faint mt-0.5 block text-xs">
          <span className="sr-only">, </span>
          {row.tripDate ? `Trip ${formatTripDate(row.tripDate)}` : "No trip date"}
          {" · "}
          <RelativeDay iso={new Date(row.createdAt).toISOString()} prefix="Published" />
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs">
        {opening ? (
          <>
            <Icon icon="lucide:loader-circle" size={14} className="motion-safe:animate-spin" />
            <span>Opening</span>
          </>
        ) : isOpen ? (
          <>
            <span className="sr-only">, </span>
            {isDirty ? <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 rounded-full" /> : null}
            <span className="text-dose-accent-strong font-medium">{isDirty ? "Editing, unsaved" : "Editing"}</span>
          </>
        ) : (
          <>
            <span className="sr-only">, </span>
            <span className="theme-text-muted [@media(pointer:fine)]:sr-only">Edit</span>
            <Icon icon="lucide:chevron-right" size={16} className="theme-dev-link-row-chevron" />
          </>
        )}
      </span>
    </button>
  );
}
