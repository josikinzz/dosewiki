import type { TranslationRecordKind } from "./liveTranslation";

/** Units are distinct source hashes within each record, summed across records. */
export type CoverageCounts = {
  records: number;
  units: number;
  current: number;
  missing: number;
  stale: number;
  rejected: number;
  /** Advisory glossary disagreements, overlapping the four storage states. */
  glossaryMisses: number;
};
export type TranslationQueueCoverage = {
  queued: number;
  running: number;
  failed: number;
  completed: number;
  /** Subset of queued jobs with a recorded failed attempt. */
  retrying: number;
};
export type TranslationCoveragePage = CoverageCounts & {
  kind: TranslationRecordKind;
  slug: string;
  href: string;
};
export type TranslationCoverageResponse = {
  ok: true;
  locale: string;
  generatedAt: number;
  inventoryGeneratedAt: number;
  scope: "public-records";
  uniqueHashes: number;
  catalogDigest?: string | null;
  summary: CoverageCounts;
  byKind: Array<CoverageCounts & { kind: TranslationRecordKind }>;
  pages: TranslationCoveragePage[];
  affectedPagesTotal: number;
  pagesLimit: number;
  queue: TranslationQueueCoverage;
  ui?: {
    locale: string;
    total: number;
    translated: number;
    missingIds: string[];
    approved: number;
    approvalMismatches: string[];
    glossaryMisses?: Array<{ catalogKey: string; term: string; expectedTarget: string; humanApproved: boolean }>;
    compiledAt: string | null;
    approvedSnapshotCurrent: boolean;
    liveVerified: false;
  };
  exclusions: string[];
  publication: { status: "unverified"; message: string };
};
