import { describe, expect, it } from "vitest";
import { articlePublicationNotice, publicationDelivery } from "./publicationNotice";

describe("publicationDelivery", () => {
  it("reads the durable outbox receipt the article route returns as pending", () => {
    expect(publicationDelivery([{ status: "pending", verification: "pending" }])).toBe("pending");
  });

  it("is done only when every receipt was accepted and nothing awaits verification", () => {
    expect(publicationDelivery([{ status: "accepted", verification: "verified" }])).toBe("done");
    expect(publicationDelivery([{ status: "accepted", verification: "not-requested" }])).toBe("done");
    expect(publicationDelivery([{ status: "accepted", verification: "incomplete" }])).toBe("pending");
  });

  it("reports a refused or unreachable target as failed", () => {
    expect(publicationDelivery([
      { status: "accepted", verification: "verified" },
      { status: "unreachable", verification: "pending" },
    ])).toBe("failed");
  });

  it("says nothing it cannot back up when no receipt arrived", () => {
    expect(publicationDelivery(undefined)).toBe("unknown");
    expect(publicationDelivery([])).toBe("unknown");
  });
});

describe("articlePublicationNotice", () => {
  it("never calls a pending change published and points at the App Path", () => {
    const notice = articlePublicationNotice("lsd", [{ status: "pending", verification: "pending" }]);
    expect(notice.message).not.toMatch(/\bpublished\b/i);
    expect(notice.message).toMatch(/pending/);
    expect(notice.path).toBe("/lsd");
  });
});
