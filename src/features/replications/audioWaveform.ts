/**
 * A deterministic bar pattern for audio rows.
 *
 * Audio has no frame to show, and a blank tile in a grid of pictures reads as a
 * broken image. The bars are derived from the row's own identity so the same
 * asset always draws the same shape: a placeholder that is stable, not a
 * waveform that is true. Nothing here is sampled from the file, so every
 * consumer renders the strip aria-hidden and lets the caption and the medium
 * chip carry the meaning.
 */
export function audioWaveformBars(seedSource: string, count = 28): number[] {
  const seed = seedSource.length;
  return Array.from(
    { length: count },
    (_, index) => 14 + Math.abs(Math.sin((index + seed) * 1.7)) * 72,
  );
}
