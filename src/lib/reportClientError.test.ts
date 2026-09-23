import { afterEach, describe, expect, it, vi } from "vitest";

import { reportClientError } from "./reportClientError";

describe("reportClientError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports an error once, however many boundaries see it", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("stage exploded");

    expect(reportClientError(error, { boundary: "replication-viewer-stage" })).toBe(true);
    expect(reportClientError(error, { boundary: "root" })).toBe(false);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain("replication-viewer-stage");
    expect(log.mock.calls[0]?.[1]).toBe(error);
  });

  it("reports each separate occurrence", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    reportClientError(new Error("first"), { boundary: "root" });
    reportClientError(new Error("second"), { boundary: "root" });

    expect(log).toHaveBeenCalledTimes(2);
  });

  it("carries the component stack and server digest when present", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("render failed"), { digest: "123abc" });

    reportClientError(error, { boundary: "root", componentStack: "\n    at Stage" });

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("root"),
      error,
      { digest: "123abc", componentStack: "\n    at Stage" },
    );
  });

  it("reports thrown non-objects without deduplicating them", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(reportClientError("plain string", { boundary: "root" })).toBe(true);
    expect(reportClientError("plain string", { boundary: "root" })).toBe(true);

    expect(log).toHaveBeenCalledTimes(2);
  });
});
