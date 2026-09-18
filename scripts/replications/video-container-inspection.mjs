import fs from "node:fs";

// ---------------------------------------------------------------------------
// MP4 atom inspection — objective faststart verification
// ---------------------------------------------------------------------------

/**
 * Walk the top-level box list of an ISO base media file.
 *
 * `readChunk(offset, length) => Buffer` is injected so the walk is testable
 * against a synthetic buffer without touching the filesystem, and so a 4.8 GB
 * file is inspected by seeking over box headers instead of being read.
 */
export function analyzeAtomLayout(readChunk, fileSize, { limit = 64 } = {}) {
  const atoms = [];
  let offset = 0;
  let truncated = false;

  while (offset + 8 <= fileSize && atoms.length < limit) {
    const header = readChunk(offset, 16);
    if (!header || header.length < 8) break;

    const type = header.toString("latin1", 4, 8);
    // A non-printable type means we have lost sync with the box grid; stop
    // rather than report garbage as an atom list.
    if (!/^[\x20-\x7e]{4}$/.test(type)) break;

    let size = header.readUInt32BE(0);
    let headerSize = 8;

    if (size === 1) {
      if (header.length < 16) break;
      size = Number(header.readBigUInt64BE(8));
      headerSize = 16;
    } else if (size === 0) {
      // Box runs to end of file.
      size = fileSize - offset;
    }

    atoms.push(type);
    if (size < headerSize) break;

    // A box that claims to end past EOF means the file is short. This is the
    // only reliable truncation signal for a faststart file: with the moov at
    // the head, ffprobe happily reports full dimensions and duration for a file
    // whose payload was cut off, so a probe alone cannot tell them apart.
    if (offset + size > fileSize) {
      truncated = true;
      break;
    }
    offset += size;
  }

  return { atoms, truncated, faststart: hasFaststartLayout(atoms) && !truncated };
}

/** Convenience wrapper: the top-level box types in file order. */
export function listTopLevelAtomTypes(readChunk, fileSize, options) {
  return analyzeAtomLayout(readChunk, fileSize, options).atoms;
}

/**
 * `moov` before `mdat` is precisely what `-movflags +faststart` produces and
 * precisely what lets a browser start decoding from the first bytes it receives.
 */
export function hasFaststartLayout(atomTypes) {
  const moov = atomTypes.indexOf("moov");
  if (moov === -1) return false;
  const mdat = atomTypes.indexOf("mdat");
  if (mdat === -1) return true;
  return moov < mdat;
}

export function inspectMp4Atoms(filePath) {
  const stats = fs.statSync(filePath);
  const fd = fs.openSync(filePath, "r");
  try {
    const readChunk = (offset, length) => {
      const buffer = Buffer.alloc(length);
      const read = fs.readSync(fd, buffer, 0, length, offset);
      return buffer.subarray(0, read);
    };
    return analyzeAtomLayout(readChunk, stats.size);
  } finally {
    fs.closeSync(fd);
  }
}

// ---------------------------------------------------------------------------
// Probe normalisation
// ---------------------------------------------------------------------------

function parseRational(value) {
  if (typeof value !== "string" || !value.includes("/")) {
    const direct = Number(value);
    return Number.isFinite(direct) && direct > 0 ? direct : null;
  }
  const [numerator, denominator] = value.split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  const rate = numerator / denominator;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** Normalise raw `ffprobe -print_format json` output into the shape the planner uses. */
export function parseProbeJson(raw) {
  const streams = Array.isArray(raw?.streams) ? raw.streams : [];
  const format = raw?.format ?? {};
  const videoStream = streams.find((stream) => stream.codec_type === "video");
  const audioStream = streams.find((stream) => stream.codec_type === "audio");

  const durationSeconds =
    Number(format.duration) || Number(videoStream?.duration) || null;
  const bitrateBps = Number(format.bit_rate) || null;

  return {
    formatNames: String(format.format_name ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
    sizeBytes: Number(format.size) || null,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    bitrateBps: Number.isFinite(bitrateBps) ? bitrateBps : null,
    video: videoStream
      ? {
          codec: videoStream.codec_name ?? null,
          width: Number(videoStream.width) || null,
          height: Number(videoStream.height) || null,
          pixelFormat: videoStream.pix_fmt ?? null,
          fps:
            parseRational(videoStream.avg_frame_rate) ??
            parseRational(videoStream.r_frame_rate),
        }
      : null,
    audio: audioStream
      ? { codec: audioStream.codec_name ?? null, channels: Number(audioStream.channels) || null }
      : null,
    hasAudio: Boolean(audioStream),
  };
}

