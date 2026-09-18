// Image decoding, video probing, frame extraction, and avatar rendering.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import sharp from "sharp";

import type { Dimensions } from "./generate-avatar-candidates";

const execFileAsync = promisify(execFile);

// sharp is a native addon and this script runs under Bun, whose allocator has
// been seen to abort when several sharp pipelines are in flight at once. Decoding
// is serialized through `withSharp` below; the network fetches around it still
// run in parallel, which is where the wall-clock time actually goes.
sharp.concurrency(1);

let sharpQueue: Promise<unknown> = Promise.resolve();
function withSharp<T>(work: () => Promise<T>): Promise<T> {
  const next = sharpQueue.then(work, work);
  sharpQueue = next.catch(() => undefined);
  return next;
}
/** 2x the largest render: `ContributorAvatar size="lg"` is 128 CSS px. */
export const AVATAR_SIZE = 256;
const AVATAR_WEBP_QUALITY = 82;

/**
 * Mean luminance, 0-255, below which a frame is treated as black. A fade-in
 * frame measures in the low single digits; the darkest frame this run actually
 * keeps is far above it. Deliberately generous: the cost of rejecting a usable
 * dark frame is trying the next one, and the cost of keeping a black one is a
 * contributor whose avatar is a black circle.
 */
export const MIN_FRAME_LUMA = 24;

/**
 * Where in a video to look, in seconds, in order. Starts a second in because
 * these open on fades from black.
 */
export const FRAME_LADDER_SECONDS = Object.freeze([1, 2, 3.5, 5, 8]);
/* ------------------------------------------------------------------- imaging */

/**
 * The centred square of a source, and the size it is delivered at.
 *
 * Never enlarges: a source whose short side is under {@link AVATAR_SIZE} is
 * delivered at its own size rather than stretched up to a size it does not have.
 */
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

/** Mean luminance 0-255 of an encoded image, as the black-frame guard reads it. */
export async function meanLuminance(bytes: Buffer): Promise<number> {
  const { channels } = await withSharp(() => sharp(bytes).greyscale().stats());
  return channels[0].mean;
}

/**
 * Auto-orient first, then measure. `sharp` reports pre-rotation dimensions, so a
 * portrait phone photo carrying EXIF orientation 6 would otherwise be cropped
 * against a landscape frame it does not actually have.
 */
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

/**
 * The timestamps to try for a video of a given length, in order.
 *
 * Anything at or past the end is dropped, and a clip shorter than the first rung
 * is sampled at its midpoint — which is still not `t=0`, the frame this ladder
 * exists to avoid.
 */
export function frameLadder(duration: number): number[] {
  const usable = FRAME_LADDER_SECONDS.filter(
    (seconds) => duration <= 0 || seconds < duration,
  );
  return usable.length > 0 ? [...usable] : [Number((duration / 2).toFixed(3))];
}

/**
 * The frame taken when the ladder yields nothing at all.
 *
 * `t=0` is the frame the ladder exists to avoid, so it is not on it and never
 * competes with a real frame for brightness. It is reached only when every other
 * seek produced no image — which one row does:
 * `smeared-walk-through-the-woods-oracle-emissary` is a 0.04-second, single-frame
 * mp4 where any seek at all lands past the end of the file.
 */
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

/**
 * A still from a video, taken a second or so in and checked for black.
 *
 * Every attempt is reported, including the rejected ones, so a contributor whose
 * source is dark end to end is visible in the run rather than discovered later
 * as a black circle on their profile.
 */
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

/** Centre-crop to a square and encode the delivered avatar. */
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

/**
 * The same delivery, cropped where the content is instead of at the centre.
 *
 * A centre square is right for artwork, which is composed around its middle. It
 * is wrong for a tall photograph of a person: heads sit in the upper third, so
 * the centred square of a portrait is a picture of a chest. `sharp`'s attention
 * strategy picks the region with the most detail and keeps that instead, which
 * on a portrait is the face.
 *
 * Reserved for sources that are noticeably off-square. A near-square avatar has
 * nothing to choose between, and the centre crop is the predictable one.
 */
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

/** Off-square enough that where the crop lands changes what the avatar shows. */
export function needsAttentionCrop(
  { width, height }: Dimensions,
  tolerance = 1.15,
): boolean {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  return short > 0 && long / short > tolerance;
}
