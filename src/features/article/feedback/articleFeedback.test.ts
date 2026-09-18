import { describe, expect, it } from "vitest";

import {
  ARTICLE_FEEDBACK_DETAILS_MAX_LENGTH,
  createArticleFeedbackRow,
  validateArticleFeedback,
  type ArticleFeedbackInput,
} from "./articleFeedback";

const validInput: ArticleFeedbackInput = {
  substance_slug: "mescaline",
  substance_title: "Mescaline",
  category: "inaccurate",
  importance: "normal",
  details: "The oral duration looks off; recent sources list a longer offset.",
  source_url: "https://pubmed.example/study",
  contact_email: "reader@example.com",
  honeypot: "",
  user_agent: "vitest",
};

describe("validateArticleFeedback", () => {
  it("accepts a well-formed submission and trims fields", () => {
    const result = validateArticleFeedback({
      ...validInput,
      details: `  ${validInput.details}  `,
      source_url: "",
      contact_email: "",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.details).toBe(validInput.details);
      expect(result.normalized.source_url).toBeUndefined();
      expect(result.normalized.contact_email).toBeUndefined();
    }
  });

  it("rejects unknown categories and importances", () => {
    const result = validateArticleFeedback({
      ...validInput,
      category: "rant",
      importance: "apocalyptic",
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors).toHaveLength(2);
    }
  });

  it("rejects empty details, oversized details, and non-http source URLs", () => {
    expect(validateArticleFeedback({ ...validInput, details: "   " }).ok).toBe(false);
    expect(
      validateArticleFeedback({
        ...validInput,
        details: "x".repeat(ARTICLE_FEEDBACK_DETAILS_MAX_LENGTH + 1),
      }).ok,
    ).toBe(false);
    expect(
      validateArticleFeedback({ ...validInput, source_url: "javascript:alert(1)" }).ok,
    ).toBe(false);
  });

  it("rejects contact emails without an @", () => {
    expect(validateArticleFeedback({ ...validInput, contact_email: "not-an-email" }).ok).toBe(false);
  });
});

describe("createArticleFeedbackRow", () => {
  it("starts clean submissions as new", () => {
    const validation = validateArticleFeedback(validInput);
    expect(validation.ok).toBe(true);
    if (validation.ok === false) {
      return;
    }

    const row = createArticleFeedbackRow(validation.normalized, {
      id: "feedback-1",
      now: new Date("2026-07-02T12:00:00.000Z"),
      ip_hash: "sha256:abc",
    });

    expect(row.status).toBe("new");
    expect(row.honeypot_triggered).toBe(false);
    expect(row.created_at).toBe("2026-07-02T12:00:00.000Z");
    expect(row.ip_hash).toBe("sha256:abc");
  });

  it("marks honeypot submissions as spam", () => {
    const validation = validateArticleFeedback({ ...validInput, honeypot: "https://spam.example" });
    expect(validation.ok).toBe(true);
    if (validation.ok === false) {
      return;
    }

    const row = createArticleFeedbackRow(validation.normalized, { id: "feedback-2" });
    expect(row.status).toBe("spam");
    expect(row.honeypot_triggered).toBe(true);
  });
});
