export function audioWaveformBars(seedSource: string, count = 28): number[] {
  const seed = seedSource.length;
  return Array.from(
    { length: count },
    (_, index) => 14 + Math.abs(Math.sin((index + seed) * 1.7)) * 72,
  );
}
