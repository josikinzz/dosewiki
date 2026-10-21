import type { PiruImportedReport } from "./piruReportImport";

export type SubjectDraft = {
  name: string;
  trip_date: string;
  age: string;
  gender: string;
  height: string;
  weight: string;
  medications: string;
  setting: string;
};

export type SubstanceDraft = {
  id: string;
  name: string;
  dose: string;
  roa: string;
};

export type TimelineDraft = {
  id: string;
  time: string;
  description: string;
};

export type TimelinePhase = "onset" | "peak" | "offset";

export type NarrativeMode = "simple" | "detailed";

type ReportDraft = {
  title: string;
  subject: SubjectDraft;
  substances: SubstanceDraft[];
  introduction: string;
  timeline: Record<TimelinePhase, TimelineDraft[]>;
  conclusion: string;
  tags: string;
  contact_email: string;
  may_contact: boolean;
  publish_consent: boolean;
  age_confirmed: boolean;
  website: string;
};

export type ReportTextField = "title" | "introduction" | "conclusion" | "tags" | "contact_email" | "website";
export type ConsentField = "may_contact" | "publish_consent" | "age_confirmed";
export type SubstanceField = keyof Omit<SubstanceDraft, "id">;
export type TimelineField = keyof Omit<TimelineDraft, "id">;

export function createInitialDraft(): ReportDraft {
  return {
    title: "",
    subject: {
      name: "",
      trip_date: "",
      age: "",
      gender: "",
      height: "",
      weight: "",
      medications: "",
      setting: "",
    },
    substances: [{ id: "substance-1", name: "", dose: "", roa: "" }],
    introduction: "",
    timeline: {
      onset: [{ id: "onset-1", time: "", description: "" }],
      peak: [{ id: "peak-1", time: "", description: "" }],
      offset: [{ id: "offset-1", time: "", description: "" }],
    },
    conclusion: "",
    tags: "",
    contact_email: "",
    may_contact: false,
    publish_consent: false,
    age_confirmed: false,
    website: "",
  };
}

export function applyPiruReport(draft: ReportDraft, report: PiruImportedReport, nextId: () => number): ReportDraft {
  const timeline = { ...draft.timeline };
  for (const phase of ["onset", "peak", "offset"] as const) {
    if (report.timeline[phase].length > 0) {
      timeline[phase] = report.timeline[phase].map((entry) => ({ id: `${phase}-${nextId()}`, ...entry }));
    }
  }
  return {
    ...draft,
    title: report.title || draft.title,
    substances:
      report.substances.length > 0
        ? report.substances.map((substance) => ({ id: `substance-${nextId()}`, ...substance }))
        : draft.substances,
    introduction: report.introduction || draft.introduction,
    timeline,
    conclusion: report.conclusion || draft.conclusion,
    tags: report.tags || draft.tags,
  };
}

export function omitDraftId<T extends { id: string }>(value: T): Omit<T, "id"> {
  const { id: _id, ...rest } = value;
  return rest;
}
