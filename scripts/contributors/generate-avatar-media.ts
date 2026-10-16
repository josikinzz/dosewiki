import { execFile } from "node:child_process";
import { promisify } from "node:util";

import sharp from "sharp";

import type { Dimensions } from "./generate-avatar-candidates";

const execFileAsync = promisify(execFile);

sharp.concurrency(1);

let sharpQueue: Promise<unknown> = Promise.resolve();
function withSharp<T>(work: () => Promise<T>): Promise<T> {
  const next = sharpQueue.then(work, work);
  sharpQueue = next.catch(() => undefined);
  return next;
}
export const AVATAR_SIZE = 256;
const AVATAR_WEBP_QUALITY = 82;

export const MIN_FRAME_LUMA = 24;

export const FRAME_LADDER_SECONDS = Object.freeze([1, 2, 3.5, 5, 8]);

export function centreSquare(
  { width, height }: Dimensions,
  target = AVATAR_SIZE,
) {
  const side = Math.min(width, height);
  return {
    left: Math.round((width - side) / 2),
    top: Math.round((height - side) / 2),
    side,
    output: Math.min(side, target),
  };
}

export async function meanLuminance(bytes: Buffer): Promise<number> {
  const { channels } = await withSharp(() => sharp(bytes).greyscale().stats());
  return channels[0].mean;
}

export async function orientImage(
  bytes: Buffer,
): Promise<{ bytes: Buffer; dimensions: Dimensions }> {
  return await withSharp(async () => {
    const oriented = await sharp(bytes, { animated: false })
      .rotate()
      .toBuffer();
    const metadata = await sharp(oriented).metadata();
    return {
      bytes: oriented,
      dimensions: { width: metadata.width, height: metadata.height },
    };
  });
}

export async function fetchBytes(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error(`${url} returned an empty body`);
  }
  return bytes;
}

export async function probeVideo(
  url: string,
): Promise<Dimensions & { duration: number }> {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,duration",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      url,
    ],
    { maxBuffer: 1024 * 1024 * 16 },
  );
  const parsed = JSON.parse(stdout);
  const stream = parsed.streams?.[0];
  if (!stream?.width || !stream?.height) {
    throw new Error("ffprobe reported no video stream");
  }
  return {
    width: stream.width,
    height: stream.height,
    duration: Number(stream.duration ?? parsed.format?.duration ?? 0) || 0,
  };
}

export function frameLadder(duration: number): number[] {
  const usable = FRAME_LADDER_SECONDS.filter(
    (seconds) => duration <= 0 || seconds < duration,
  );
  return usable.length > 0 ? [...usable] : [Number((duration / 2).toFixed(3))];
}

export const LAST_RESORT_FRAME_SECONDS = 0;

async function extractFrame(url: string, seconds: number): Promise<Buffer> {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-nostdin",
      "-v",
      "error",
      "-ss",
      String(seconds),
      "-i",
      url,
      "-frames:v",
      "1",
      "-f",
      "image2pipe",
      "-vcodec",
      "png",
      "-",
    ],
    { maxBuffer: 1024 * 1024 * 256, encoding: "buffer" },
  );
  const bytes = Buffer.from(stdout);
  if (bytes.length === 0) {
    throw new Error(`ffmpeg produced no frame at t=${seconds}s`);
  }
  return bytes;
}

export async function selectVideoFrame(url: string, duration: number) {
  const attempts: Array<{ seconds: number; luma: number; bytes: Buffer }> = [];

  const tryAt = async (seconds: number) => {
    let bytes: Buffer;
    try {
      bytes = await extractFrame(url, seconds);
    } catch {
      return false;
    }
    const luma = await meanLuminance(bytes);
    attempts.push({ seconds, luma, bytes });
    return luma >= MIN_FRAME_LUMA;
  };

  for (const seconds of frameLadder(duration)) {
    if (await tryAt(seconds)) {
      return {
        chosen: attempts[attempts.length - 1],
        attempts,
        fellBackToBrightest: false,
      };
    }
  }

  if (attempts.length === 0 && (await tryAt(LAST_RESORT_FRAME_SECONDS))) {
    return {
      chosen: attempts[attempts.length - 1],
      attempts,
      fellBackToBrightest: false,
    };
  }

  if (attempts.length === 0) {
    throw new Error("no frame could be extracted at any timestamp");
  }

  const brightest = [...attempts].sort(
    (left, right) => right.luma - left.luma,
  )[0];
  return { chosen: brightest, attempts, fellBackToBrightest: true };
}

export async function renderAvatar(bytes: Buffer, dimensions: Dimensions) {
  const crop = centreSquare(dimensions);
  const encoded = await withSharp(() =>
    sharp(bytes)
      .extract({
        left: crop.left,
        top: crop.top,
        width: crop.side,
        height: crop.side,
      })
      .resize(crop.output, crop.output, { fit: "fill" })
      .webp({ quality: AVATAR_WEBP_QUALITY })
      .toBuffer(),
  );

  return { bytes: encoded, size: crop.output, crop };
}

export async function renderAvatarAttention(
  bytes: Buffer,
  dimensions: Dimensions,
) {
  const output = Math.min(
    Math.min(dimensions.width, dimensions.height),
    AVATAR_SIZE,
  );
  const encoded = await withSharp(() =>
    sharp(bytes)
      .resize(output, output, {
        fit: "cover",
        position: sharp.strategy.attention,
      })
      .webp({ quality: AVATAR_WEBP_QUALITY })
      .toBuffer(),
  );

  return { bytes: encoded, size: output };
}

export function needsAttentionCrop(
  { width, height }: Dimensions,
  tolerance = 1.15,
): boolean {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  return short > 0 && long / short > tolerance;
}
