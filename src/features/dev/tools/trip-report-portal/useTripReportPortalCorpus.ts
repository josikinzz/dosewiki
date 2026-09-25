"use client";

import { useCallback, useState } from "react";

import type { TripReportSubmissionRow } from "@/features/reports/submissions/tripReportSubmissions";
import type {
  TripReportSubmissionPortalIndex,
  TripReportSubmissionPortalSummary,
} from "@/features/reports/submissions/dataTripReportSubmissionStore";
import type { PortalContributorOption, PublishedReportPayload } from "./tripReportPortalModel";

const CORPUS_API = "/api/dev/trip-reports";
const SUBMISSION_INDEX_API = "/api/trip-report-submissions/queue?scope=portal";

type CorpusPayload = {
  reports: PublishedReportPayload[];
  contributors: PortalContributorOption[];
  submissions: TripReportSubmissionPortalSummary[];
};

type DatasetState = { status: "loading" | "ready" } | { status: "error"; message: string };
type LoadState = { corpus: DatasetState; submissions: DatasetState };

/**
 * Last corpus this tab saw, kept outside React so leaving and re-entering the
 * tab paints the previous rows immediately instead of replaying the loading
 * state. The refetch still runs on every mount; it just happens behind the
 * already-rendered list.
 */
let cachedPublished: Pick<CorpusPayload, "reports" | "contributors"> | null = null;
let cachedSubmissions: TripReportSubmissionPortalSummary[] | null = null;

/**
 * The portal's two datasets, published reports and the submission queue,
 * each loaded independently so one failing endpoint still paints the other.
 * Every local write goes through `updateReports` or `replaceSubmission`, which
 * keep the module cache in step with what the list shows.
 */
export function useTripReportPortalCorpus() {
  const [corpus, setCorpus] = useState<CorpusPayload>(() => ({
    reports: cachedPublished?.reports ?? [],
    contributors: cachedPublished?.contributors ?? [],
    submissions: cachedSubmissions ?? [],
  }));
  const [load, setLoad] = useState<LoadState>({
    corpus: cachedPublished ? { status: "ready" } : { status: "loading" },
    submissions: cachedSubmissions ? { status: "ready" } : { status: "loading" },
  });

  const loadPublished = useCallback(async () => {
    setLoad((current) => ({
      ...current,
      corpus: cachedPublished ? current.corpus : { status: "loading" },
    }));
    try {
      const response = await fetch(CORPUS_API);
      if (!response.ok) {
        const message = await readError(response, "Failed to load the corpus.");
        setLoad((current) => ({
          ...current,
          corpus: { status: "error", message },
        }));
        return;
      }
      const payload = await response.json();
      const next = {
        reports: Array.isArray(payload.reports) ? payload.reports : [],
        contributors: Array.isArray(payload.contributors) ? payload.contributors : [],
      };
      cachedPublished = next;
      setCorpus((current) => ({ ...current, ...next }));
      setLoad((current) => ({ ...current, corpus: { status: "ready" } }));
    } catch {
      setLoad((current) => ({
        ...current,
        corpus: { status: "error", message: "Could not reach the server to load trip reports." },
      }));
    }
  }, []);

  const loadSubmissionIndex = useCallback(async () => {
    setLoad((current) => ({
      ...current,
      submissions: cachedSubmissions ? current.submissions : { status: "loading" },
    }));
    try {
      const response = await fetch(SUBMISSION_INDEX_API);
      if (!response.ok) {
        const message = await readError(response, "Failed to load the submission queue.");
        setLoad((current) => ({
          ...current,
          submissions: { status: "error", message },
        }));
        return;
      }
      const payload = await response.json() as Partial<TripReportSubmissionPortalIndex>;
      const next = [
        ...(Array.isArray(payload.needsReview) ? payload.needsReview : []),
        ...(Array.isArray(payload.history) ? payload.history : []),
      ];
      cachedSubmissions = next;
      setCorpus((current) => ({ ...current, submissions: next }));
      setLoad((current) => ({ ...current, submissions: { status: "ready" } }));
    } catch {
      setLoad((current) => ({
        ...current,
        submissions: { status: "error", message: "Could not reach the server to load submissions." },
      }));
    }
  }, []);

  const updateReports = useCallback(
    (update: (reports: PublishedReportPayload[]) => PublishedReportPayload[]) => {
      setCorpus((current) => {
        const reports = update(current.reports);
        cachedPublished = { reports, contributors: current.contributors };
        return { ...current, reports };
      });
    },
    [],
  );

  const replaceSubmission = useCallback((submission: TripReportSubmissionRow) => {
    const summary = submissionSummaryOf(submission);
    setCorpus((current) => {
      const submissions = current.submissions.map((row) => row.id === summary.id ? summary : row);
      cachedSubmissions = submissions;
      return { ...current, submissions };
    });
  }, []);

  return { corpus, load, loadPublished, loadSubmissionIndex, updateReports, replaceSubmission };
}

export async function readError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => ({}));
  return typeof payload.error === "string" ? payload.error : fallback;
}

function submissionSummaryOf(submission: TripReportSubmissionRow): TripReportSubmissionPortalSummary {
  return {
    id: submission.id,
    status: submission.status,
    title: submission.title,
    author_name: submission.author_name,
    created_at: submission.created_at,
    report: {
      subject: submission.report.subject,
      substances: submission.report.substances,
      tags: submission.report.tags,
    },
  };
}
