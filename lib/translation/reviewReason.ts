export const CORRECTION_REASON_KINDS = ["fluency", "terminology", "accuracy", "local"] as const;
export type CorrectionReasonKind = (typeof CORRECTION_REASON_KINDS)[number];
export type ReviewReason = { kind: CorrectionReasonKind | "unspecified"; note: string };

export const CORRECTION_REASON_LABEL: Record<ReviewReason["kind"], string> = {
  fluency: "Fluency",
  terminology: "Terminology",
  accuracy: "Accuracy",
  local: "Local addition",
  unspecified: "No reason kind",
};

export const REVIEW_REASON_NOTE_MAX = 1000;
export const GLOSSARY_EXCEPTIONS_MAX = 50;

export function isCorrectionReasonKind(value: unknown): value is CorrectionReasonKind {
  return (CORRECTION_REASON_KINDS as readonly unknown[]).includes(value);
}

export function parseReviewReason(raw: unknown): ReviewReason | null {
  if (typeof raw === "string") {
    const note = raw.trim();
    return note && note.length <= REVIEW_REASON_NOTE_MAX ? { kind: "unspecified", note } : null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { kind, note = "" } = raw as { kind?: unknown; note?: unknown };
  if (typeof note !== "string" || note.trim().length > REVIEW_REASON_NOTE_MAX) return null;
  if (kind === "unspecified") return note.trim() ? { kind, note: note.trim() } : null;
  return isCorrectionReasonKind(kind) ? { kind, note: note.trim() } : null;
}

export function parseGlossaryExceptions(raw: unknown): string[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > GLOSSARY_EXCEPTIONS_MAX) return null;
  const terms = raw.map((term) => (typeof term === "string" ? term.trim() : ""));
  return terms.every((term) => term && term.length <= 200) ? [...new Set(terms)] : null;
}

type StoredReason = { v: 1; kind: ReviewReason["kind"]; note: string; glossaryExceptions?: string[] };

export function encodeReviewReason(reason: ReviewReason, glossaryExceptions: readonly string[] = []): string {
  if (reason.kind === "unspecified" && glossaryExceptions.length === 0) return reason.note.trim();
  const stored: StoredReason = { v: 1, kind: reason.kind, note: reason.note.trim() };
  if (glossaryExceptions.length) stored.glossaryExceptions = [...glossaryExceptions];
  return JSON.stringify(stored);
}

export function decodeReviewReason(stored: string): { reason: ReviewReason; glossaryExceptions: string[] } {
  if (stored.startsWith("{")) {
    try {
      const value = JSON.parse(stored) as Partial<StoredReason> | null;
      if (value?.v === 1 && (isCorrectionReasonKind(value.kind) || value.kind === "unspecified") && typeof value.note === "string") {
        const exceptions = Array.isArray(value.glossaryExceptions) ? value.glossaryExceptions.filter((term): term is string => typeof term === "string") : [];
        return { reason: { kind: value.kind, note: value.note }, glossaryExceptions: exceptions };
      }
    } catch {
    }
  }
  return { reason: { kind: "unspecified", note: stored }, glossaryExceptions: [] };
}

export function formatReviewReason(reason: ReviewReason): string {
  if (reason.kind === "unspecified") return reason.note;
  return reason.note ? `${CORRECTION_REASON_LABEL[reason.kind]}: ${reason.note}` : CORRECTION_REASON_LABEL[reason.kind];
}
