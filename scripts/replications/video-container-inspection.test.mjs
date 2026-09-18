import { describe, expect, it } from "vitest";
import {
  analyzeAtomLayout,
  hasFaststartLayout,
  listTopLevelAtomTypes,
  parseProbeJson,
} from "./video-container-inspection.mjs";

/** Build a synthetic ISO-BMFF top-level box grid so atom parsing is testable without ffmpeg. */
function makeAtoms(boxes) {
  const buffers = boxes.map(({ type, payload = 0 }) => {
    const buffer = Buffer.alloc(8 + payload);
    buffer.writeUInt32BE(8 + payload, 0);
    buffer.write(type, 4, "latin1");
    return buffer;
  });
  return Buffer.concat(buffers);
}

function readerFor(buffer) {
  return (offset, length) => buffer.subarray(offset, offset + length);
}

describe("listTopLevelAtomTypes", () => {
  it("walks the top-level box grid in order", () => {
    const buffer = makeAtoms([
      { type: "ftyp", payload: 16 },
      { type: "moov", payload: 32 },
      { type: "mdat", payload: 64 },
    ]);

    expect(listTopLevelAtomTypes(readerFor(buffer), buffer.length)).toEqual([
      "ftyp",
      "moov",
      "mdat",
    ]);
  });

  it("follows a 64-bit largesize header", () => {
    const large = Buffer.alloc(16 + 8);
    large.writeUInt32BE(1, 0);
    large.write("mdat", 4, "latin1");
    large.writeBigUInt64BE(BigInt(24), 8);
    const buffer = Buffer.concat([makeAtoms([{ type: "moov", payload: 8 }]), large]);

    expect(listTopLevelAtomTypes(readerFor(buffer), buffer.length)).toEqual(["moov", "mdat"]);
  });

  it("stops instead of reporting garbage once it loses sync", () => {
    const buffer = Buffer.concat([
      makeAtoms([{ type: "ftyp", payload: 8 }]),
      Buffer.from([0, 0, 0, 16, 0x01, 0x02, 0x03, 0x04]),
    ]);

    expect(listTopLevelAtomTypes(readerFor(buffer), buffer.length)).toEqual(["ftyp"]);
  });

  it("does not spin forever on a zero-length box", () => {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32BE(4, 0);
    buffer.write("moov", 4, "latin1");

    expect(listTopLevelAtomTypes(readerFor(buffer), buffer.length)).toEqual(["moov"]);
  });
});
describe("analyzeAtomLayout", () => {
  it("flags a file whose last box claims to run past EOF", () => {
    const buffer = makeAtoms([
      { type: "ftyp", payload: 8 },
      { type: "moov", payload: 8 },
      { type: "mdat", payload: 8 },
    ]);
    // Cut the payload off, exactly as a truncated download or partial copy would.
    const layout = analyzeAtomLayout(readerFor(buffer), buffer.length - 6);

    expect(layout.truncated).toBe(true);
    // The critical property: moov is at the head, so a probe would call this
    // file healthy. Structural truncation must veto that.
    expect(layout.atoms).toEqual(["ftyp", "moov", "mdat"]);
    expect(layout.faststart).toBe(false);
  });

  it("reports an intact faststart file as complete", () => {
    const buffer = makeAtoms([
      { type: "ftyp", payload: 8 },
      { type: "moov", payload: 8 },
      { type: "mdat", payload: 64 },
    ]);
    const layout = analyzeAtomLayout(readerFor(buffer), buffer.length);

    expect(layout).toMatchObject({ truncated: false, faststart: true });
  });
});
describe("hasFaststartLayout", () => {
  it("is true only when moov precedes mdat", () => {
    expect(hasFaststartLayout(["ftyp", "moov", "mdat"])).toBe(true);
    expect(hasFaststartLayout(["ftyp", "mdat", "moov"])).toBe(false);
  });

  it("is false when there is no moov at all", () => {
    expect(hasFaststartLayout(["ftyp", "mdat"])).toBe(false);
  });
});
describe("parseProbeJson", () => {
  it("normalises streams, rational frame rates, and audio presence", () => {
    const probe = parseProbeJson({
      format: { format_name: "mov,mp4,m4a", size: "1234", duration: "12.5", bit_rate: "8000000" },
      streams: [
        {
          codec_type: "video",
          codec_name: "h264",
          width: 1920,
          height: 1080,
          pix_fmt: "yuv420p",
          avg_frame_rate: "30000/1001",
        },
        { codec_type: "audio", codec_name: "aac", channels: 2 },
      ],
    });

    expect(probe.formatNames).toEqual(["mov", "mp4", "m4a"]);
    expect(probe.durationSeconds).toBeCloseTo(12.5);
    expect(probe.bitrateBps).toBe(8000000);
    expect(probe.video.fps).toBeCloseTo(29.97, 2);
    expect(probe.hasAudio).toBe(true);
  });

  it("reports a silent file rather than inventing an audio stream", () => {
    const probe = parseProbeJson({
      format: { format_name: "mp4", size: "10" },
      streams: [{ codec_type: "video", codec_name: "h264", width: 100, height: 100, pix_fmt: "yuv420p" }],
    });

    expect(probe.hasAudio).toBe(false);
    expect(probe.audio).toBeNull();
  });

  it("survives a frame rate of 0/0", () => {
    const probe = parseProbeJson({
      format: { format_name: "mp4" },
      streams: [
        { codec_type: "video", codec_name: "h264", width: 8, height: 8, avg_frame_rate: "0/0", r_frame_rate: "25/1" },
      ],
    });

    expect(probe.video.fps).toBe(25);
  });
});
