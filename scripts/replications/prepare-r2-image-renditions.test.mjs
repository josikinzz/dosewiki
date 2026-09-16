import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { expect, it, vi } from "vitest";

it("preserves animated WebP frames, timing, and loop count at every rendition size", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rendition-animation-"));
  const originalArgv = process.argv;
  const frameBytes = 128 * 128 * 3;
  const pixels = Buffer.alloc(frameBytes * 2);
  pixels.fill(Buffer.from([255, 0, 0]), 0, frameBytes);
  pixels.fill(Buffer.from([0, 255, 0]), frameBytes);
  const source = await sharp(pixels, {
    raw: { width: 128, height: 256, channels: 3, pageHeight: 128 },
  }).webp({ loop: 3, delay: [60, 90] }).toBuffer();
  const digest = createHash("sha256").update(source).digest("hex");
  const key = `media/sha256/${digest.slice(0, 2)}/${digest}.webp`;
  const keysPath = path.join(directory, "keys.json");
  const out = path.join(directory, "output");
  fs.writeFileSync(keysPath, JSON.stringify({ keys: [key] }));
  try {
    vi.resetModules();
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
    vi.stubGlobal("fetch", async (url) => {
      if (url !== `https://dosewiki-media.gremblinzuwu.workers.dev/${key}`) {
        throw new Error("Unexpected network request");
      }
      return new Response(source);
    });
    process.argv = [process.execPath, "prepare-r2-image-renditions.ts", "--keys", keysPath, "--out", out, "--concurrency=1"];
    await import("./prepare-r2-image-renditions.ts");
    const plan = JSON.parse(fs.readFileSync(path.join(out, "plan.json"), "utf8"));
    expect(plan.sources).toHaveLength(1);
    expect(plan.sources[0].variants.some((variant) => variant.width < 128)).toBe(true);
    for (const variant of plan.sources[0].variants) {
      const metadata = await sharp(fs.readFileSync(path.join(out, variant.key)), { animated: true }).metadata();
      expect({ pages: metadata.pages, delay: metadata.delay, loop: metadata.loop }).toEqual({ pages: 2, delay: [60, 90], loop: 3 });
      expect(metadata.width).toBe(Math.min(variant.width, 128));
      expect(metadata.pageHeight).toBe(Math.min(variant.width, 128));
    }
  } finally {
    process.argv = originalArgv;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
