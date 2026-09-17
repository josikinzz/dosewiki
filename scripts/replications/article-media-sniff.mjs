import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { sniffImageContentType } from "./repoint-renditions.mjs";

/**
 * What a local file's first bytes say it is, which outranks its extension.
 *
 * Storage serves back whatever `Content-Type` the upload declared, so this is the
 * difference between an asset that renders and one the browser downloads. The
 * image signatures are `repoint-renditions.mjs`'s, unchanged; the two container
 * formats below are what the recovered animations arrive as and it has none.
 */
export function sniffMediaContentType(head) {
  const image = sniffImageContentType(head);
  if (image) {
    return image;
  }
  if (!head || head.length < 12) {
    return null;
  }
  if (head.subarray(4, 8).toString("latin1") === "ftyp") {
    return "video/mp4";
  }
  if (head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return "video/webm";
  }
  return null;
}

/**
 * Width, height and duration straight out of the container, when ffprobe is here.
 *
 * The recovered files include a 14-frame GIF and an H.264 clip, and `sharp` can
 * read one of those. ffprobe reads both, so it is tried first and its absence
 * costs nothing: the decisions file records the same numbers, pinned to these
 * exact bytes by the sha-256 beside them.
 */
function probeLocalMedia(filePath) {
  try {
    const probe = JSON.parse(
      execFileSync(
        "ffprobe",
        ["-v", "error", "-show_entries", "stream=width,height", "-show_entries", "format=duration", "-of", "json", filePath],
        // An undecodable file is answered by the decisions file's own numbers,
        // so ffprobe's complaint about it is noise rather than news.
        { maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "ignore"] },
      ).toString(),
    );
    const stream = (probe.streams ?? []).find((entry) => entry.width && entry.height);
    return {
      width: stream?.width,
      height: stream?.height,
      duration: Number(probe.format?.duration) || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * What a recovered file is, taken from the file rather than from anything about it.
 *
 * Three claims in the decisions file are checked rather than trusted, because
 * each one is a way the wrong bytes could reach production wearing the right
 * name: the digest (these are the reviewed bytes), the content type (the
 * container agrees with what will be declared on upload), and the dimensions
 * (the file is the one that was measured). Any disagreement throws — a recovered
 * asset that has drifted is not a smaller problem than a missing one.
 */
export function readUploadFacts(upload, uploadsDir) {
  if (!uploadsDir) {
    throw new Error(
      `Asset ${upload.path} has to be uploaded, so pass --uploads-dir=<directory the decisions file's upload paths are relative to>.`,
    );
  }
  const absolutePath = path.resolve(uploadsDir, upload.path);
  if (!fs.existsSync(absolutePath)) {
    return { upload: null, storageId: null, reachable: false, status: 0, error: `not found at ${absolutePath}` };
  }

  const bytes = fs.readFileSync(absolutePath);
  const digest = crypto.createHash("sha256").update(bytes).digest("base64");
  if (upload.sha256 && digest !== upload.sha256) {
    throw new Error(
      `${upload.path} is not the reviewed file: sha-256 ${digest} where the decisions file records ${upload.sha256}.`,
    );
  }

  const contentType = sniffMediaContentType(bytes.subarray(0, 12));
  if (!contentType) {
    throw new Error(`${upload.path} has no recognised container signature, so nothing can declare its content type.`);
  }
  if (upload.contentType && contentType !== upload.contentType) {
    throw new Error(
      `${upload.path} is a ${contentType} where the decisions file records ${upload.contentType}. Uploading it under the recorded type would make the browser download it instead of showing it.`,
    );
  }

  const probed = probeLocalMedia(absolutePath) ?? {};
  for (const field of ["width", "height"]) {
    if (probed[field] && upload[field] && probed[field] !== upload[field]) {
      throw new Error(
        `${upload.path} is ${probed.width}x${probed.height} where the decisions file records ${upload.width}x${upload.height}.`,
      );
    }
  }

  return {
    upload: { ...upload, absolutePath, contentType },
    storageId: null,
    reachable: true,
    status: 200,
    contentType,
    // Storage reports a stored object's digest as base64 sha-256, so computing it
    // the same way here is what lets a recovered file be compared against the
    // bytes production already holds.
    digest,
    size: bytes.byteLength,
    width: probed.width ?? upload.width,
    height: probed.height ?? upload.height,
    duration: probed.duration ?? upload.duration,
  };
}

