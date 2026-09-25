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
 */

import { useCallback, useEffect, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EditorNotice,
  EditorPanel,
  EditorSection,
  EditorStatusPill,
  EditorTable,
  EditorTableBody,
  EditorTableCell,
  EditorTableHead,
  EditorTableHeading,
  EditorTableRow,
  LoadErrorState,
  TagToken,
  useConfirm,
  useDirtyGuard,
  useUnsavedWork,
  type EditorNoticeMessage,
} from "@/features/dev/components";
import { INTAKE_STATUS_LABEL, INTAKE_STATUS_TONE } from "@/features/intake/intakeStatus";
import type { TripReportEditableFields } from "../../../../../server/lib/tripReportEditing";
import { PortalReportTimelineEditor } from "../trip-report-portal/PortalReportTimelineEditor";
import {
  assignReportOwner,
  fetchMySubmissions,
  fetchOwnedRecord,
  fetchOwnedReports,
  formatPublished,
  saveOwnedReport,
  sortOwnedReports,
  type MemberSubmission,
  type OwnedReportRecord,
  type OwnedReportRow,
} from "./myReportsModel";
import { assignedNotice, MY_REPORTS_EMPTY_DESCRIPTION } from "./ownershipCopy";

type OpenReport = { record: OwnedReportRecord; draft: TripReportEditableFields };

const DISCARD_COPY = {
  title: "Discard your edits?",
  description: "This report has changes that were not saved. Discarding them leaves the live page as it is now.",
};

export function MyReportsTab({ canApprove = false }: { canApprove?: boolean }) {
  const [rows, setRows] = useState<OwnedReportRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenReport | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  const dirty = open !== null && JSON.stringify(open.draft) !== JSON.stringify(open.record.fields);
  // The in-tool guard keeps row clicks and Close; the shell owns rail clicks,
  // Leave and unload. Saving republishes the page, so the shell only discards.
  const { guard, dialog: discardDialog } = useDirtyGuard(dirty, { ...DISCARD_COPY, warnOnUnload: false });
  useUnsavedWork({
    id: "my-reports:report",
    tab: "my-reports",
    label: `My reports: edits to /reports/${open?.record.slug ?? ""}`,
    dirty,
    publishesLive: true,
    discard: () => setOpen((current) => (current ? { ...current, draft: current.record.fields } : current)),
  });
  const { confirm, dialog: publishDialog } = useConfirm();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setRows(await fetchOwnedReports());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load your reports.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openReport = async (row: OwnedReportRow) => {
    setOpeningId(row.id);
    setNotice(null);
    try {
      const record = await fetchOwnedRecord(row.id);
      setOpen({ record, draft: record.fields });
    } catch (error) {
      setNotice({
        tone: "danger",
        message: error instanceof Error ? error.message : "Unable to open that report.",
      });
    } finally {
      setOpeningId(null);
    }
  };

  const save = async () => {
    if (!open) {
      return;
    }
    setSaving(true);
    setNotice(null);
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
      setNotice({ tone: "success", message: `Saved /reports/${saved.slug}.` });
    } catch (error) {
      setNotice({
        tone: "danger",
        message: error instanceof Error ? error.message : "The save did not go through.",
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmSave = () => {
    if (!open) {
      return;
    }
    confirm({
      title: `Publish to /reports/${open.record.slug}?`,
      description:
        "Saving replaces the live page right away. Readers see the new title, tags and body as soon as it saves.",
      confirmLabel: "Save and publish",
      onConfirm: save,
    });
  };

  return (
    <div className="space-y-10">
      <EditorSection
        icon="lucide:notebook-pen"
        title="My reports"
        description="Published trip reports you own. Open one to revise its title, tags, or body; the change goes live on save."
        actions={
          <Button type="button" variant="ghost" size="sm" onClick={() => void load()} disabled={rows === null && !loadError}>
            <Icon icon="lucide:refresh-cw" size={14} />
            Refresh
          </Button>
        }
      >
        {notice ? <EditorNotice notice={notice} /> : null}

        {loadError ? (
          <LoadErrorState message={loadError} onRetry={() => void load()} />
        ) : rows === null ? (
          <StateCard loading compact title="Loading your reports" />
        ) : rows.length === 0 ? (
          <StateCard
            tone="neutral"
            icon="lucide:notebook"
            title="No reports yet"
            description={MY_REPORTS_EMPTY_DESCRIPTION}
            compact
          />
        ) : (
          <OwnedReportTable
            rows={rows}
            openId={open?.record.id ?? null}
            openingId={openingId}
            onOpen={(row) => guard(() => void openReport(row))}
          />
        )}
      </EditorSection>

      {open ? (
        <OwnedReportEditor
          open={open}
          dirty={dirty}
          saving={saving}
          onChange={(draft) => setOpen({ ...open, draft })}
          onRevert={() => setOpen({ ...open, draft: open.record.fields })}
          onSave={confirmSave}
          onClose={() =>
            guard(() => {
              setOpen(null);
              setNotice(null);
            })
          }
        />
      ) : null}

      <SubmissionsSection />

      {discardDialog}
      {publishDialog}

      {canApprove ? <AssignOwnerSection onAssigned={() => void load()} /> : null}
    </div>
  );
}

/**
 * Admin only: hand a published report to a member by slug. The one place the
 * owner route has a form; the portal's editor stays untouched.
 */
function AssignOwnerSection({ onAssigned }: { onAssigned: () => void }) {
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);

  const assign = async () => {
    setPending(true);
    setNotice(null);
    try {
      const result = await assignReportOwner(slug, email);
      setNotice({ tone: "success", message: assignedNotice(result.slug, result.ownerEmail) });
      setSlug("");
      setEmail("");
      onAssigned();
    } catch (error) {
      setNotice({
        tone: "danger",
        message: error instanceof Error ? error.message : "The owner was not assigned.",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <EditorSection
      icon="lucide:user-round-check"
      title="Assign an owner"
      description="Admin only. The member gets edit rights to the report from this tab; the email must belong to an existing membership."
      headingLevel="h3"
    >
      {notice ? <EditorNotice notice={notice} /> : null}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void assign();
        }}
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="assign-owner-slug" className="theme-text-faint mb-1.5 block text-xs font-medium uppercase tracking-wide">
            Report slug
          </label>
          <Input id="assign-owner-slug" value={slug} className="font-mono" onChange={(event) => setSlug(event.target.value)} />
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="assign-owner-email" className="theme-text-faint mb-1.5 block text-xs font-medium uppercase tracking-wide">
            Member email
          </label>
          <Input id="assign-owner-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <Button type="submit" variant="accent" size="sm" disabled={pending || !slug.trim() || !email.trim()}>
          {pending ? "Assigning" : "Assign owner"}
        </Button>
      </form>
    </EditorSection>
  );
}

/**
 * The member's own submissions and where each stands, in the shared intake
 * status words. A rejected one shows the public reason the reviewer gave;
 * private review notes never reach this page.
 */
function SubmissionsSection() {
  const [rows, setRows] = useState<MemberSubmission[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setRows(await fetchMySubmissions());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load your submissions.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <EditorSection
      icon="lucide:inbox"
      title="Submissions"
      description="Trip reports you submitted with this account's email, and where each one stands. Nothing is emailed, so check here for decisions."
      headingLevel="h3"
    >
      {loadError ? (
        <LoadErrorState message={loadError} onRetry={() => void load()} />
      ) : rows === null ? (
        <StateCard loading compact title="Loading your submissions" />
      ) : rows.length === 0 ? (
        <StateCard
          tone="neutral"
          icon="lucide:inbox"
          title="No submissions"
          description="A trip report you submit with this account's email appears here with its status."
          compact
        />
      ) : (
        <EditorTable className="md:min-w-[40rem]">
          <EditorTableHead>
            <EditorTableHeading>Title</EditorTableHeading>
            <EditorTableHeading>Status</EditorTableHeading>
            <EditorTableHeading>Submitted</EditorTableHeading>
            <EditorTableHeading>Details</EditorTableHeading>
          </EditorTableHead>
          <EditorTableBody>
            {rows.map((row) => (
              <EditorTableRow key={row.id} data-submission={row.id}>
                <EditorTableCell wide>
                  <span className="block truncate text-sm font-medium theme-text-primary">{row.title}</span>
                </EditorTableCell>
                <EditorTableCell label="Status">
                  <EditorStatusPill tone={INTAKE_STATUS_TONE[row.status]}>{INTAKE_STATUS_LABEL[row.status]}</EditorStatusPill>
                </EditorTableCell>
                <EditorTableCell label="Submitted" className="theme-text-secondary font-mono text-xs">
                  {row.submitted_at.slice(0, 10)}
                </EditorTableCell>
                <EditorTableCell label="Details" wide className="theme-text-secondary text-sm">
                  <SubmissionDetails row={row} />
                </EditorTableCell>
              </EditorTableRow>
            ))}
          </EditorTableBody>
        </EditorTable>
      )}
    </EditorSection>
  );
}

function SubmissionDetails({ row }: { row: MemberSubmission }) {
  if (row.public_reason) {
    return (
      <span>
        <span className="theme-text-faint text-xs font-medium uppercase tracking-wide">Reason: </span>
        {row.public_reason}
      </span>
    );
  }
  if (row.status === "published" && row.report_slug) {
    return (
      <a href={`/reports/${row.report_slug}`} target="_blank" rel="noreferrer" className="font-mono text-xs hover:underline">
        /reports/{row.report_slug}
      </a>
    );
  }
  if (row.status === "rejected") {
    return <span className="theme-text-faint">No reason was given.</span>;
  }
  if (row.status === "published") {
    return <span className="theme-text-faint">Live on the site.</span>;
  }
  if (row.status === "accepted") {
    return <span className="theme-text-faint">Accepted and waiting to be published.</span>;
  }
  return <span className="theme-text-faint">Waiting on a reviewer.</span>;
}

function OwnedReportTable({
  rows,
  openId,
  openingId,
  onOpen,
}: {
  rows: readonly OwnedReportRow[];
  openId: string | null;
  openingId: string | null;
  onOpen: (row: OwnedReportRow) => void;
}) {
  return (
    <EditorTable className="md:min-w-[40rem]">
      <EditorTableHead>
        <EditorTableHeading>Title</EditorTableHeading>
        <EditorTableHeading>Address</EditorTableHeading>
        <EditorTableHeading>Trip date</EditorTableHeading>
        <EditorTableHeading>Published</EditorTableHeading>
        <EditorTableHeading>
          <span className="sr-only">Actions</span>
        </EditorTableHeading>
      </EditorTableHead>
      <EditorTableBody>
        {sortOwnedReports(rows).map((row) => (
          <EditorTableRow key={row.id} data-report={row.slug}>
            <EditorTableCell wide>
              <span className="block truncate text-sm font-medium theme-text-primary">{row.title}</span>
            </EditorTableCell>
            <EditorTableCell label="Address" wide>
              <a
                href={`/reports/${row.slug}`}
                target="_blank"
                rel="noreferrer"
                className="theme-text-secondary block truncate font-mono text-xs hover:underline md:inline"
              >
                /reports/{row.slug}
              </a>
            </EditorTableCell>
            <EditorTableCell label="Trip date" className="theme-text-secondary font-mono text-xs">
              {row.tripDate ?? "Unknown"}
            </EditorTableCell>
            <EditorTableCell label="Published" className="theme-text-secondary font-mono text-xs">
              {formatPublished(row.createdAt)}
            </EditorTableCell>
            <EditorTableCell wide className="md:text-right">
              <Button
                type="button"
                variant={openId === row.id ? "accent" : "outline"}
                size="sm"
                className="w-full md:w-auto"
                disabled={openingId !== null}
                onClick={() => onOpen(row)}
              >
                {openingId === row.id ? "Opening" : openId === row.id ? "Open" : "Edit"}
              </Button>
            </EditorTableCell>
          </EditorTableRow>
        ))}
      </EditorTableBody>
    </EditorTable>
  );
}

function OwnedReportEditor({
  open,
  dirty,
  saving,
  onChange,
  onClose,
  onRevert,
  onSave,
}: {
  open: OpenReport;
  dirty: boolean;
  saving: boolean;
  onChange: (draft: TripReportEditableFields) => void;
  onClose: () => void;
  onRevert: () => void;
  onSave: () => void;
}) {
  const { record, draft } = open;
  const [tagDraft, setTagDraft] = useState("");

  function patch(next: Partial<TripReportEditableFields>) {
    onChange({ ...draft, ...next });
  }

  return (
    <EditorSection
      icon="lucide:pencil-line"
      title="Edit report"
      description={`Editing the live page at /reports/${record.slug}. Byline, attribution, subject details and substances are changed by an editor from the trip report portal.`}
      headingLevel="h3"
      actions={
        <>
          <Button asChild variant="ghost" size="sm">
            <a href={`/reports/${record.slug}`} target="_blank" rel="noreferrer">
              <Icon icon="lucide:external-link" size={14} />
              View live
            </a>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close editor">
            Close
          </Button>
        </>
      }
    >
      <EditorPanel variant="default" className="flex min-h-0 flex-col" data-testid="my-report-editor">
        <div className="space-y-4 px-5 py-4">
          <div className="min-w-0">
            <label htmlFor="my-report-title" className="theme-text-faint mb-1.5 block text-xs font-medium uppercase tracking-wide">
              Title
            </label>
            <Input
              id="my-report-title"
              value={draft.title}
              onChange={(event) => patch({ title: event.target.value })}
              className="font-display text-lg font-semibold"
            />
          </div>

          <div>
            <span className="theme-text-faint mb-1.5 block text-xs font-medium uppercase tracking-wide">Tags</span>
            <div className="theme-replication-field theme-portal-rule flex flex-wrap items-center gap-1.5 rounded-md border p-1.5">
              {draft.tags.map((tag, index) => (
                <TagToken
                  key={`${tag}-${index}`}
                  label={tag}
                  variant="compact"
                  removeLabel={`Remove tag ${tag}`}
                  onRemove={() => patch({ tags: draft.tags.filter((_, at) => at !== index) })}
                />
              ))}
              <input
                aria-label="Add tag"
                value={tagDraft}
                placeholder="Add tag"
                className="theme-text-primary min-w-24 flex-1 bg-transparent px-1 py-0.5 text-[13px] outline-none"
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && tagDraft.trim()) {
                    event.preventDefault();
                    patch({ tags: [...draft.tags, tagDraft.trim()] });
                    setTagDraft("");
                  } else if (event.key === "Backspace" && !tagDraft && draft.tags.length > 0) {
                    patch({ tags: draft.tags.slice(0, -1) });
                  }
                }}
              />
            </div>
          </div>

          <div>
            <span className="theme-text-faint mb-2.5 block text-xs font-medium uppercase tracking-wide">Report body</span>
            <PortalReportTimelineEditor draft={draft} onChange={onChange} />
          </div>
        </div>

        <footer className="theme-portal-rule sticky bottom-0 flex flex-wrap items-center gap-2 border-t px-5 py-3 backdrop-blur">
          <Button type="button" variant="accent" disabled={saving || !dirty} onClick={onSave}>
            {saving ? "Saving" : "Save"}
          </Button>
          <Button type="button" variant="ghost" disabled={saving || !dirty} onClick={onRevert}>
            Revert
          </Button>
          {dirty ? <span className="text-dose-accent-soft text-xs">Unsaved changes; Save republishes the page</span> : null}
        </footer>
      </EditorPanel>
    </EditorSection>
  );
}
