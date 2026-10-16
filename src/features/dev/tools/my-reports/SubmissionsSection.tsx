"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EditorSection, EditorStatusPill, LoadErrorState } from "@/features/dev/components";
import { INTAKE_STATUS_LABEL, INTAKE_STATUS_TONE } from "@/features/intake/intakeStatus";
import { CappedList, HeadingCount, OnwardLink, RelativeDay, RowSkeletons, SectionNote } from "../home/homeParts";
import { countNoun } from "../home/homeModel";
import {
  fetchMySubmissions,
  sortSubmissions,
  submissionOutcome,
  type MemberSubmission,
} from "./myReportsModel";

export const SUBMISSIONS_SECTION_ID = "my-reports-submissions";

const IN_REVIEW: ReadonlySet<MemberSubmission["status"]> = new Set(["new", "reviewing", "accepted"]);

export function submissionTally(rows: readonly MemberSubmission[]): string {
  const inReview = rows.filter((row) => IN_REVIEW.has(row.status)).length;
  const live = rows.filter((row) => row.status === "published").length;
  const rejected = rows.filter((row) => row.status === "rejected").length;
  return [
    inReview ? `${inReview} in review` : null,
    live ? `${live} live` : null,
    rejected ? `${rejected} turned down` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

export function SubmissionsSection({
  reloadToken,
  ownedSlugs,
  onEditOwned,
}: {
  reloadToken: number;
  ownedSlugs: ReadonlySet<string>;
  onEditOwned: (slug: string) => void;
}) {
  const [rows, setRows] = useState<MemberSubmission[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      setRows(sortSubmissions(await fetchMySubmissions()));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load your submissions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  return (
    <EditorSection
      id={SUBMISSIONS_SECTION_ID}
      icon="lucide:inbox"
      title="Submissions"
      description="Trip reports you sent with this account's email, and where each one stands. Nothing is emailed, so decisions show up here."
      className="scroll-mt-24"
      actions={rows && rows.length > 0 ? <HeadingCount>{submissionTally(rows) || countNoun(rows.length, "submission")}</HeadingCount> : null}
    >
      {loadError ? (
        <LoadErrorState what="your submissions" message={loadError} onRetry={() => void load()} busy={loading} />
      ) : rows === null ? (
        <RowSkeletons rows={3} label="your submissions" />
      ) : rows.length === 0 ? (
        <div className="space-y-1">
          <SectionNote icon="lucide:inbox">
            <span className="theme-text-secondary font-medium">No submissions.</span> A trip report you submit with
            this account&apos;s email appears here with its status.
          </SectionNote>
          <OnwardLink href="/reports/submit">Submit a trip report</OnwardLink>
        </div>
      ) : (
        <CappedList
          items={rows}
          getKey={(row) => row.id}
          label="Your submissions"
          noun="submissions"
          renderItem={(row) => (
            <SubmissionRow
              row={row}
              onEdit={row.report_slug && ownedSlugs.has(row.report_slug) ? () => onEditOwned(row.report_slug!) : null}
            />
          )}
        />
      )}
    </EditorSection>
  );
}

function SubmissionRow({ row, onEdit }: { row: MemberSubmission; onEdit: (() => void) | null }) {
  const outcome = submissionOutcome(row);
  return (
    <article data-submission={row.id} aria-label={row.title} className="space-y-1.5 px-2.5 py-3">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <h3 className="theme-text-primary min-w-0 break-words text-sm font-medium">{row.title}</h3>
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 sm:flex-row-reverse">
          <EditorStatusPill tone={INTAKE_STATUS_TONE[row.status]}>{INTAKE_STATUS_LABEL[row.status]}</EditorStatusPill>
          <span className="theme-text-faint text-xs">
            <RelativeDay iso={row.submitted_at} prefix="Submitted" />
            {row.decided_at ? (
              <>
                {" · "}
                <RelativeDay iso={row.decided_at} prefix="decided" />
              </>
            ) : null}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <SubmissionDetails outcome={outcome} />
        {onEdit ? (
          <Button type="button" variant="link" size="auto" className="text-sm" onClick={onEdit}>
            Edit your report
          </Button>
        ) : null}
        {row.status === "rejected" ? (
          <Link
            href="/reports/submit"
            className="theme-focus-ring theme-accent-underline rounded-control text-sm font-medium text-dose-accent-strong underline-offset-4 hover:underline"
          >
            Submit a revised report
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function SubmissionDetails({ outcome }: { outcome: ReturnType<typeof submissionOutcome> }) {
  switch (outcome.kind) {
    case "reason":
      return (
        <p className="theme-text-secondary max-w-[70ch] text-sm">
          <span className="theme-text-muted font-medium">Reason: </span>
          {outcome.reason}
        </p>
      );
    case "live":
      return (
        <p className="text-sm">
          <a
            href={`/reports/${outcome.slug}`}
            target="_blank"
            rel="noreferrer"
            className="theme-focus-ring theme-accent-underline inline-flex items-center gap-1 rounded-control break-all font-mono text-xs text-dose-accent-strong underline-offset-4 hover:underline"
          >
            /reports/{outcome.slug}
            <Icon icon="lucide:arrow-up-right" size={12} aria-hidden />
          </a>
        </p>
      );
    case "note":
      return <p className="theme-text-muted text-sm">{outcome.text}</p>;
  }
}
