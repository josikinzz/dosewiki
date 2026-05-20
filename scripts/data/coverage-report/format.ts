import { TOTAL_SUBSTANCES } from "./config";

export function formatCell(count: number | undefined, total = TOTAL_SUBSTANCES): string {
  if (!count || count === 0) return "-";
  return `${count} (${((count / total) * 100).toFixed(0)}%)`;
}

export function formatPct(count: number, total = TOTAL_SUBSTANCES): string {
  return `${count} (${((count / total) * 100).toFixed(1)}%)`;
}
