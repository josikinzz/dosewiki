/**
 * How many items share the first row of a CSS grid, measured from the DOM.
 *
 * The studio's grids are responsive (2/3/4 columns), so arrow-key navigation
 * cannot assume a column count without moving diagonally at some widths. Layout
 * is the only honest source: items on the first visual row share its offset.
 */
export function columnsIn(container: HTMLElement | null, itemSelector: string): number {
  if (!container) return 1;
  const items = Array.from(container.querySelectorAll<HTMLElement>(itemSelector));
  if (items.length === 0) return 1;
  const top = items[0].offsetTop;
  let columns = 0;
  for (const item of items) {
    if (item.offsetTop !== top) break;
    columns += 1;
  }
  return Math.max(1, columns);
}
