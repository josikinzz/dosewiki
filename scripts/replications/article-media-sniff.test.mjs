import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readUploadFacts, sniffMediaContentType } from "./article-media-sniff.mjs";

describe("sniffMediaContentType", () => {
  it("reads the two container formats the recovered assets arrive as", () => {
    const mp4 = Buffer.alloc(16);
    mp4.write("ftyp", 4, "latin1");
    expect(sniffMediaContentType(mp4)).toBe("video/mp4");

    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(12)]);
    expect(sniffMediaContentType(webm)).toBe("video/webm");
  });

  it("still answers for the image signatures repoint-renditions already knew", () => {
    const gif = Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.alloc(12)]);
    expect(sniffMediaContentType(gif)).toBe("image/gif");
  });

  it("returns null rather than guessing", () => {
    expect(sniffMediaContentType(Buffer.alloc(16))).toBeNull();
    expect(sniffMediaContentType(null)).toBeNull();
  });
});
describe("readUploadFacts", () => {
  const withFile = (bytes, run) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-uploads-"));
    fs.writeFileSync(path.join(dir, "asset.gif"), bytes);
    try {
      return run(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  const gifBytes = Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.alloc(64)]);
  // base64 sha-256, the shape storage reports a stored object's digest in, so a
  // recovered file can be compared against bytes production already holds.
  const gifDigest = "hcZyK+UUict5+eKb0kBAeFijMThy/6gw/nNKhkq9VWU=";

  it("reads the file's own facts and returns them as a pending upload", () => {
    const result = withFile(gifBytes, (dir) =>
      readUploadFacts({ path: "asset.gif", sha256: gifDigest, contentType: "image/gif" }, dir),
    );
    expect(result.storageId).toBeNull();
    expect(result.contentType).toBe("image/gif");
    expect(result.digest).toBe(gifDigest);
    expect(result.upload.path).toBe("asset.gif");
  });

  it("refuses bytes that are not the reviewed ones", () => {
    expect(() =>
      withFile(gifBytes, (dir) =>
        readUploadFacts({ path: "asset.gif", sha256: "not-the-reviewed-digest", contentType: "image/gif" }, dir),
      ),
    ).toThrow(/not the reviewed file/);
  });

  it("refuses a file whose container disagrees with the declared content type", () => {
    expect(() =>
      withFile(gifBytes, (dir) =>
        readUploadFacts({ path: "asset.gif", sha256: gifDigest, contentType: "image/jpeg" }, dir),
      ),
    ).toThrow(/where the decisions file records image\/jpeg/);
  });

  it("reports a missing file as unreachable rather than throwing", () => {
    const result = withFile(gifBytes, (dir) => readUploadFacts({ path: "gone.gif" }, dir));
    expect(result.reachable).toBe(false);
  });

  it("insists on being told where the recovered files are", () => {
    expect(() => readUploadFacts({ path: "asset.gif" }, null)).toThrow(/--uploads-dir/);
  });
});
