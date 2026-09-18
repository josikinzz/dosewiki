#!/usr/bin/env node
/**
 * Watch Batch Progress
 *
 * Monitors batch-history-culture-progress.json and displays a progress bar.
 * Run in a separate terminal while the batch script is running.
 *
 * Usage:
 *   node scripts/watch-batch-progress.mjs
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGRESS_FILE = join(__dirname, "../..", "notes-and-plans/exports/batch/batch-history-culture-progress.json");

function formatElapsed(startTime) {
  const elapsed = (Date.now() - new Date(startTime).getTime()) / 1000;
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);
  return `${mins}m ${secs}s`;
}

function formatETA(startTime, current, total) {
  if (current === 0) return "calculating...";
  const elapsed = (Date.now() - new Date(startTime).getTime()) / 1000;
  const rate = current / elapsed;
  const remaining = (total - current) / rate;
  const mins = Math.floor(remaining / 60);
  const secs = Math.floor(remaining % 60);
  return `~${mins}m ${secs}s`;
}

function renderProgressBar(current, total, width = 40) {
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  return "\u2501".repeat(filled) + "\u2591".repeat(empty);
}

function render() {
  console.clear();

  if (!existsSync(PROGRESS_FILE)) {
    console.log("\n  Waiting for batch to start...\n");
    console.log("  Run the batch script in another terminal:");
    console.log("    node scripts/batch-generate-history-culture.mjs --all\n");
    return true;
  }

  let data;
  try {
    data = JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
  } catch {
    console.log("\n  Error reading progress file. Waiting...\n");
    return true;
  }

  const pct = ((data.current / data.total) * 100).toFixed(1);
  const statusColor = data.status === "completed" ? "\x1b[32m" :
                      data.status === "failed" ? "\x1b[31m" : "\x1b[33m";
  const reset = "\x1b[0m";

  console.log(`\n  Batch: history_culture | ${statusColor}${data.status.toUpperCase()}${reset}\n`);
  console.log(`  ${renderProgressBar(data.current, data.total)} ${data.current}/${data.total} (${pct}%)\n`);
  console.log(`  \u2713 ${data.completed} completed | \u2717 ${data.failed} failed | \u2298 ${data.skipped} skipped`);

  if (data.currentBatch?.length) {
    const display = data.currentBatch.slice(0, 3).join(", ");
    const more = data.currentBatch.length > 3 ? ` +${data.currentBatch.length - 3} more` : "";
    console.log(`  Current: ${display}${more}`);
  }

  const elapsed = formatElapsed(data.startTime);
  const eta = data.status === "running" ? ` | ETA: ${formatETA(data.startTime, data.current, data.total)}` : "";
  console.log(`\n  Elapsed: ${elapsed}${eta}\n`);

  if (data.inputTokens > 0) {
    console.log(`  Tokens: ${data.inputTokens.toLocaleString()} in / ${data.outputTokens.toLocaleString()} out\n`);
  }

  return data.status !== "completed" && data.status !== "failed";
}

// Main loop
const interval = setInterval(() => {
  if (!render()) {
    clearInterval(interval);
    console.log("  Batch complete! Check the console output for details.\n");
  }
}, 500);

render();
