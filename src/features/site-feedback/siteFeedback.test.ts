import { describe, expect, it } from "vitest";

import {
  SITE_FEEDBACK_DETAILS_MAX_LENGTH,
  createSiteFeedbackRow,
  validateSiteFeedback,
  type SiteFeedbackInput,
} from "./siteFeedback";

const validInput: SiteFeedbackInput = {
  category: "technical",
  urgency: "normal",
  details: "The search box loses focus after every keystroke on Firefox.",
  page: "/category/psychedelics",
  email: "reader@example.com",
  honeypot: "",
  user_agent: "vitest",
};

describe("validateSiteFeedback", () => {
  it("accepts a well-formed submission and trims fields", () => {
    const result = validateSiteFeedback({
      ...validInput,
      details: `  ${validInput.details}  `,
      page: "",
      email: "",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.details).toBe(validInput.details);
      expect(result.normalized.page).toBeUndefined();
      expect(result.normalized.email).toBeUndefined();
    }
  });

  it("rejects unknown categories and urgencies", () => {
    const result = validateSiteFeedback({
      ...validInput,
      category: "rant",
      urgency: "apocalyptic",
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors).toHaveLength(2);
    }
  });

  it("rejects urgency on non-bug-like categories and allows it on accessibility", () => {
    expect(
      validateSiteFeedback({ ...validInput, category: "article-request" }).ok,
    ).toBe(false);
    expect(validateSiteFeedback({ ...validInput, category: "misc" }).ok).toBe(false);
    expect(validateSiteFeedback({ ...validInput, category: "accessibility" }).ok).toBe(true);
    expect(
      validateSiteFeedback({ ...validInput, category: "article-request", urgency: "" }).ok,
    ).toBe(true);
  });

  it("rejects empty details, oversized details, and invalid emails", () => {
    expect(validateSiteFeedback({ ...validInput, details: "   " }).ok).toBe(false);
    expect(
      validateSiteFeedback({
        ...validInput,
        details: "x".repeat(SITE_FEEDBACK_DETAILS_MAX_LENGTH + 1),
      }).ok,
    ).toBe(false);
    expect(validateSiteFeedback({ ...validInput, email: "not-an-email" }).ok).toBe(false);
  });
});

describe("createSiteFeedbackRow", () => {
  it("starts clean submissions as new", () => {
    const validation = validateSiteFeedback(validInput);
    expect(validation.ok).toBe(true);
    if (validation.ok === false) {
      return;
    }

    const row = createSiteFeedbackRow(validation.normalized, {
      id: "feedback-1",
      now: new Date("2026-08-14T12:00:00.000Z"),
      ip_hash: "sha256:abc",
    });

    expect(row.status).toBe("new");
    expect(row.honeypot_triggered).toBe(false);
    expect(row.urgency).toBe("normal");
    expect(row.created_at).toBe("2026-08-14T12:00:00.000Z");
    expect(row.ip_hash).toBe("sha256:abc");
  });

  it("marks honeypot submissions as spam", () => {
    const validation = validateSiteFeedback({ ...validInput, honeypot: "https://spam.example" });
    expect(validation.ok).toBe(true);
    if (validation.ok === false) {
      return;
    }

    const row = createSiteFeedbackRow(validation.normalized, { id: "feedback-2" });
    expect(row.status).toBe("spam");
    expect(row.honeypot_triggered).toBe(true);
  });
});
