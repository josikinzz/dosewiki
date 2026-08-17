import { describe, expect, it } from "vitest";
import {
  assertOutputSafety,
  assertToolsAvailable,
  assertTranscodeAllowed,
  classifyPreservation,
  isCompletedRendition,
  resolveMasterPath,
} from "./video-transcode-policy.mjs";

describe("isCompletedRendition", () => {
  const good = { video: { width: 1920, height: 1080 }, faststart: true, truncated: false, durationSeconds: 60 };

  it("accepts an intact faststart rendition matching the master", () => {
    expect(isCompletedRendition(good, { expectedDurationSeconds: 60 }).complete).toBe(true);
  });

  it("rejects a truncated rendition even though its moov still probes clean", () => {
    const result = isCompletedRendition({ ...good, truncated: true }, { expectedDurationSeconds: 60 });

    expect(result.complete).toBe(false);
    expect(result.reason).toContain("truncated");
  });

  it("rejects a rendition whose moov trails", () => {
    expect(isCompletedRendition({ ...good, faststart: false }).complete).toBe(false);
  });

  it("rejects a rendition that stops short of the master's duration", () => {
    const result = isCompletedRendition({ ...good, durationSeconds: 20 }, { expectedDurationSeconds: 60 });

    expect(result.complete).toBe(false);
    expect(result.reason).toContain("does not match");
  });

  it("tolerates the sub-second drift a container rewrite introduces", () => {
    expect(isCompletedRendition({ ...good, durationSeconds: 60.3 }, { expectedDurationSeconds: 60 }).complete).toBe(
      true,
    );
  });

  it("does not gate on duration when the master's duration is unknown", () => {
    expect(isCompletedRendition(good, { expectedDurationSeconds: null }).complete).toBe(true);
  });

  it("rejects anything with no decodable video stream", () => {
    expect(isCompletedRendition({ video: null, faststart: true }).complete).toBe(false);
  });
});
describe("master preservation", () => {
  it("treats an in-place archive as already preserved", () => {
    expect(classifyPreservation({ inPlace: true }).state).toBe("in-place");
  });

  it("demands a copy when nothing is archived yet", () => {
    expect(classifyPreservation({ inPlace: false, masterExists: false }).state).toBe("needs-copy");
  });

  it("accepts an archived master that matches the source", () => {
    expect(
      classifyPreservation({ inPlace: false, masterExists: true, sourceBytes: 10, masterBytes: 10 }).state,
    ).toBe("preserved");
  });

  it("refuses to proceed when the archived master differs, rather than overwriting it", () => {
    const result = classifyPreservation({
      inPlace: false,
      masterExists: true,
      sourceBytes: 10,
      masterBytes: 9,
    });

    expect(result.state).toBe("conflict");
    expect(result.reason).toContain("9 bytes");
  });

  it("mirrors nested source paths into the archive", () => {
    expect(resolveMasterPath("/src/a/b/clip.mov", "/src", "/archive")).toBe("/archive/a/b/clip.mov");
  });
});
describe("assertOutputSafety", () => {
  it("refuses to write renditions into the master archive", () => {
    expect(() =>
      assertOutputSafety({ sourceDir: "/src", mastersDir: "/archive", outputDir: "/archive/web" }),
    ).toThrow(/inside the master archive/);
    expect(() =>
      assertOutputSafety({ sourceDir: "/src", mastersDir: "/archive", outputDir: "/archive" }),
    ).toThrow(/inside the master archive/);
  });

  it("refuses to write renditions beside their inputs", () => {
    expect(() =>
      assertOutputSafety({ sourceDir: "/src", mastersDir: "/archive", outputDir: "/src/web" }),
    ).toThrow(/inside the source directory/);
  });

  it("allows a sibling output directory", () => {
    expect(() =>
      assertOutputSafety({ sourceDir: "/vol/masters", mastersDir: "/vol/masters", outputDir: "/vol/web" }),
    ).not.toThrow();
  });

  it("is not fooled by a shared path prefix", () => {
    expect(() =>
      assertOutputSafety({ sourceDir: "/vol/masters", mastersDir: "/vol/masters", outputDir: "/vol/masters-web" }),
    ).not.toThrow();
  });
});
describe("assertTranscodeAllowed", () => {
  const argvWithConfirm = ["--write", "--confirm-transcode"];

  it("refuses without --write", () => {
    expect(() => assertTranscodeAllowed({ writeRequested: false, dryRun: true }, argvWithConfirm)).toThrow(
      /requires --write/,
    );
  });

  it("refuses without the confirmation flag", () => {
    expect(() => assertTranscodeAllowed({ writeRequested: true, dryRun: false }, ["--write"])).toThrow(
      /--confirm-transcode/,
    );
  });

  it("refuses to combine --dry-run with --write", () => {
    expect(() =>
      assertTranscodeAllowed({ writeRequested: true, dryRun: true }, ["--write", "--dry-run", "--confirm-transcode"]),
    ).toThrow(/cannot be combined/);
  });

  it("allows the full ceremony", () => {
    expect(() => assertTranscodeAllowed({ writeRequested: true, dryRun: false }, argvWithConfirm)).not.toThrow();
  });
});
describe("assertToolsAvailable", () => {
  it("names every missing binary and how to install it", () => {
    const runner = (bin) => (bin === "ffprobe" ? { error: new Error("ENOENT") } : { status: 0 });

    expect(() => assertToolsAvailable(runner)).toThrow(/ffprobe/);
    expect(() => assertToolsAvailable(runner)).toThrow(/brew install ffmpeg/);
  });

  it("passes when both binaries answer -version", () => {
    expect(() => assertToolsAvailable(() => ({ status: 0 }))).not.toThrow();
  });
});
