"use client";

/**
 * My reports: `/dev/my-reports`. The published trip reports the signed-in
 * member owns, each openable in a content editor.
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
  type EditorNoticeMessage,
} from "@/features/dev/components";
import type { TripReportEditableFields } from "../../../../../server/lib/tripReportEditing";
import { PortalReportTimelineEditor } from "../trip-report-portal/PortalReportTimelineEditor";
import {
  assignReportOwner,
  fetchOwnedRecord,
  fetchOwnedReports,
  formatPublished,
  saveOwnedReport,
  sortOwnedReports,
  type OwnedReportRecord,
  type OwnedReportRow,
} from "./myReportsModel";

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
  const { guard, dialog: discardDialog } = useDirtyGuard(dirty, DISCARD_COPY);
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
            description="A report you submitted with this account's email becomes yours when it is published. An admin can also hand you one."
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
      setNotice({ tone: "success", message: `/reports/${result.slug} now belongs to ${result.ownerEmail}.` });
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
