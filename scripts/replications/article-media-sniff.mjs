import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { sniffImageContentType } from "./repoint-renditions.mjs";

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

function probeLocalMedia(filePath) {
  try {
    const probe = JSON.parse(
      execFileSync(
        "ffprobe",
        ["-v", "error", "-show_entries", "stream=width,height", "-show_entries", "format=duration", "-of", "json", filePath],
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
    digest,
    size: bytes.byteLength,
    width: probed.width ?? upload.width,
    height: probed.height ?? upload.height,
    duration: probed.duration ?? upload.duration,
  };
}

