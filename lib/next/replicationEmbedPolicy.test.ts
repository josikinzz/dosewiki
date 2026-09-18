// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  getReplicationEmbedFrameAncestors,
  isAllowedReplicationEmbedParent,
  isReplicationEmbedPath,
} from "./replicationEmbedPolicy";

describe("replication embed boundary", () => {
  it("matches only the document endpoint, not adjacent or encoded paths", () => {
    expect(isReplicationEmbedPath("/embed/replications")).toBe(true);
    for (const path of [
      "/embed/replications/", "/embed/replications/work", "/embed/replications-other",
      "/preview/embed/replications", "/dev/embed/replications", "/embed/%72eplications",
    ]) {
      expect(isReplicationEmbedPath(path), path).toBe(false);
    }
  });

  it("permits approved production parents and the exact publisher origin", () => {
    for (const origin of ["https://osmanthus.io", "https://www.osmanthus.io", "https://dose.wiki"]) {
      expect(isAllowedReplicationEmbedParent(origin), origin).toBe(true);
    }
    const options = { publisherOrigin: "https://www.dose.wiki" };
    expect(isAllowedReplicationEmbedParent("https://www.dose.wiki", options)).toBe(true);
    expect(isAllowedReplicationEmbedParent("https://dose.wiki", options)).toBe(false);
  });

  it("permits only the approved local app origins in the production publisher", () => {
    const ancestors = getReplicationEmbedFrameAncestors().split(" ");
    for (const origin of ["http://localhost:3000", "http://127.0.0.1:3000"]) {
      expect(isAllowedReplicationEmbedParent(origin), origin).toBe(true);
      expect(ancestors).toContain(origin);
    }
    for (const origin of ["http://localhost:3001", "http://127.0.0.1:3001", "http://10.0.0.15:3000"]) {
      expect(isAllowedReplicationEmbedParent(origin), origin).toBe(false);
      expect(ancestors).not.toContain(origin);
    }
    expect(ancestors).not.toContain("http://localhost:*");
    expect(ancestors).not.toContain("http://127.0.0.1:*");
  });

  it("rejects origin spoofing and URL-shaped values instead of normalizing them", () => {
    for (const origin of [
      "null", "", "https://osmanthus.io.evil.test", "https://preview.osmanthus.io",
      "https://osmanthus-portal.vercel.app", "https://osmanthus.io:444",
      "https://osmanthus.io/", "https://osmanthus.io/path", "https://osmanthus.io?x=1",
      "https://osmanthus.io#x", "https://user@osmanthus.io", "https://osmanthus.io@evil.test",
      "https://osmanthus.io.", " https://osmanthus.io", "https://OSMANTHUS.io",
      "https://osmanthus.io:443", "https://%6fsmanthus.io", "https://osmanthus.io\\evil.test",
      "http://osmanthus.io", "javascript:alert(1)", "file:///", "data:text/html,hello",
    ]) {
      expect(isAllowedReplicationEmbedParent(origin), origin).toBe(false);
    }
    expect(isAllowedReplicationEmbedParent("https://evil.test", {
      publisherOrigin: "https://evil.test/path",
    })).toBe(false);
  });

  it("admits only canonical HTTP loopback parents in development", () => {
    for (const origin of ["http://localhost", "http://localhost:5173", "http://127.0.0.1:5173"]) {
      expect(isAllowedReplicationEmbedParent(origin), origin).toBe(false);
      expect(isAllowedReplicationEmbedParent(origin, { isDevelopment: true }), origin).toBe(true);
      expect(isAllowedReplicationEmbedParent(origin, { publisherOrigin: origin }), origin).toBe(false);
    }
    for (const origin of [
      "http://192.168.1.2:3000", "http://127.0.0.2:3000", "http://[::1]:3000",
      "http://localhost.evil.test:3000", "http://127.1:3000", "http://2130706433:3000",
      "https://localhost:3000", "http://localhost:3000/",
    ]) {
      expect(isAllowedReplicationEmbedParent(origin, { isDevelopment: true }), origin).toBe(false);
    }
    expect(getReplicationEmbedFrameAncestors()).toBe("'self' https://osmanthus.io https://www.osmanthus.io http://localhost:3000 http://127.0.0.1:3000");
    expect(getReplicationEmbedFrameAncestors({ isDevelopment: true })).toBe(
      "'self' https://osmanthus.io https://www.osmanthus.io http://localhost:3000 http://127.0.0.1:3000 http://localhost:* http://127.0.0.1:*",
    );
  });
});
