import { describe, expect, it } from "vitest";
import {
  admitsDevScreenshotViewer,
  isDevScreenshotViewerEnabled,
  isLoopbackRequest,
} from "./devScreenshotViewer";

const ENABLED = { NODE_ENV: "development", DEV_SCREENSHOT_VIEWER: "1", DATA_WRITES_FROZEN: "1" };

function headers(values: Record<string, string>) {
  const bag = new Headers(values);
  return { get: (name: string) => bag.get(name) };
}

function request(overrides: { method?: string; pathname?: string; host?: string; forwardedFor?: string } = {}) {
  return {
    method: overrides.method ?? "GET",
    pathname: overrides.pathname ?? "/dev/replications",
    headers: headers({
      host: overrides.host ?? "127.0.0.1:3100",
      ...(overrides.forwardedFor ? { "x-forwarded-for": overrides.forwardedFor } : {}),
    }),
  };
}

describe("dev screenshot viewer gate", () => {
  it("opens only under next dev with the opt-in and an active write freeze", () => {
    expect(isDevScreenshotViewerEnabled(ENABLED)).toBe(true);
    expect(isDevScreenshotViewerEnabled({ ...ENABLED, NODE_ENV: "production" })).toBe(false);
    expect(isDevScreenshotViewerEnabled({ ...ENABLED, NODE_ENV: "test" })).toBe(false);
    expect(isDevScreenshotViewerEnabled({ ...ENABLED, NODE_ENV: undefined })).toBe(false);
    expect(isDevScreenshotViewerEnabled({ ...ENABLED, DEV_SCREENSHOT_VIEWER: undefined })).toBe(false);
    expect(isDevScreenshotViewerEnabled({ ...ENABLED, DEV_SCREENSHOT_VIEWER: "true" })).toBe(false);
    expect(isDevScreenshotViewerEnabled({ ...ENABLED, DATA_WRITES_FROZEN: undefined })).toBe(false);
    expect(isDevScreenshotViewerEnabled({ ...ENABLED, DATA_WRITES_FROZEN: "0" })).toBe(false);
    expect(isDevScreenshotViewerEnabled({ ...ENABLED, VERCEL: "1" })).toBe(false);
    expect(isDevScreenshotViewerEnabled({ ...ENABLED, VERCEL_ENV: "preview" })).toBe(false);
  });

  it("admits GET and HEAD for /dev documents from a loopback host", () => {
    for (const pathname of ["/dev", "/dev/replications", "/dev/kit", "/dev/themes"]) {
      expect(admitsDevScreenshotViewer(request({ pathname }), ENABLED)).toBe(true);
    }
    expect(admitsDevScreenshotViewer(request({ method: "HEAD" }), ENABLED)).toBe(true);
    for (const host of ["localhost:3100", "[::1]:3100", "127.0.0.1"]) {
      expect(admitsDevScreenshotViewer(request({ host }), ENABLED)).toBe(true);
    }
  });

  it("is read-only: it never admits a mutation or any API path", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(admitsDevScreenshotViewer(request({ method }), ENABLED)).toBe(false);
    }
    for (const pathname of ["/api/dev/replications", "/api/editor/library", "/devx", "/review", "/"]) {
      expect(admitsDevScreenshotViewer(request({ pathname }), ENABLED)).toBe(false);
    }
  });

  it("refuses non-loopback hosts and forwarded remote clients", () => {
    for (const host of ["dev.dose.wiki", "dose.wiki", "192.168.1.20:3100", "localhost.evil.test"]) {
      expect(admitsDevScreenshotViewer(request({ host }), ENABLED)).toBe(false);
    }
    expect(admitsDevScreenshotViewer(request({ forwardedFor: "203.0.113.9" }), ENABLED)).toBe(false);
    expect(admitsDevScreenshotViewer(request({ forwardedFor: "127.0.0.1, 203.0.113.9" }), ENABLED)).toBe(false);
    expect(isLoopbackRequest(headers({ host: "localhost:3100", "x-forwarded-for": "::ffff:127.0.0.1" }))).toBe(true);
  });

  it("is closed in production even for an otherwise perfect request", () => {
    expect(admitsDevScreenshotViewer(request(), { ...ENABLED, NODE_ENV: "production" })).toBe(false);
    expect(admitsDevScreenshotViewer(request(), { NODE_ENV: "development" })).toBe(false);
  });
});
