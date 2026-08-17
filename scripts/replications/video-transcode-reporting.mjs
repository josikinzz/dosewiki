import { BITS_PER_PIXEL } from "./video-transcode-planning.mjs";

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "n/a";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function buildTranscodeManifest({
  operation,
  generatedAt,
  mode,
  options,
  sourceDir,
  mastersDir,
  outputDir,
  summary,
  entries,
}) {
  return {
    operation,
    generatedAt,
    mode,
    options,
    sourceDir,
    mastersDir,
    outputDir,
    summary,
    entries,
  };
}

export function formatCorpusProjection(summary) {
  const lines = ["\n--- Corpus projection -------------------------------------------"];
  lines.push(`Files              : ${summary.count}`);
  for (const [action, count] of Object.entries(summary.byAction).sort()) {
    lines.push(`  ${action.padEnd(17)}: ${count}`);
  }
  if (summary.unfinished > 0) {
    lines.push(`Not delivered      : ${summary.unfinished} (blocked, unreadable, or failed)`);
  }
  lines.push(`Master total       : ${formatBytes(summary.sourceBytes)}`);
  lines.push(`Measured renditions: ${summary.measuredCount} (${formatBytes(summary.outputBytes)})`);
  lines.push(
    `Projected delivered: ${formatBytes(summary.projectedBytes.low)} – ${formatBytes(
      summary.projectedBytes.high,
    )} (central ${formatBytes(summary.projectedBytes.mid)})`,
  );
  lines.push(
    `Reduction          : ${(summary.reductionFraction.low * 100).toFixed(1)}% – ${(
      summary.reductionFraction.high * 100
    ).toFixed(1)}% (central ${(summary.reductionFraction.mid * 100).toFixed(1)}%)`,
  );
  if (summary.measuredCount < summary.count) {
    lines.push(
      `Projection uses ${BITS_PER_PIXEL.low}–${BITS_PER_PIXEL.high} bits/pixel/frame for un-encoded files; measured files use their real size.`,
    );
  }
  return lines;
}
