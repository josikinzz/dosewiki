export type NestedNumberMap = Record<string, Record<string, number>>;
export type NestedSetMap = Record<string, Record<string, Set<string>>>;

interface SourceFieldRowsOptions<T> {
  counts: Record<string, Record<string, T>>;
  extraCells?: (source: string) => Array<string | number>;
  fields: string[];
  formatValue: (value: T | undefined, source: string, field: string) => string;
  sourceNames: Record<string, string>;
  sourceOrder: string[];
}

export function incrementCount(counts: Record<string, number>, field: string, amount = 1): void {
  counts[field] = (counts[field] || 0) + amount;
}

export function incrementNestedCount(
  counts: NestedNumberMap,
  source: string,
  field: string,
  amount = 1,
): void {
  counts[source] = counts[source] || {};
  counts[source][field] = (counts[source][field] || 0) + amount;
}

export function addToNestedSet(
  counts: NestedSetMap,
  source: string,
  field: string,
  value: string,
): void {
  counts[source] = counts[source] || {};
  counts[source][field] = counts[source][field] || new Set<string>();
  counts[source][field].add(value);
}

export function incrementTextSize(charCounts: Record<string, number>, source: string, content?: string): void {
  if (!content) return;
  charCounts[source] = (charCounts[source] || 0) + content.length;
}

function renderMarkdownTable(
  headers: Array<string | number>,
  rows: Array<Array<string | number>>,
): string {
  const headerRow = `| ${headers.join(" | ")} |`;
  const dividerRow = `| ${headers.map(() => "---").join(" | ")} |`;
  const bodyRows = rows.map((row) => `| ${row.map(String).join(" | ")} |`);
  return [headerRow, dividerRow, ...bodyRows].join("\n");
}

export function renderTableSection(
  title: string,
  headers: Array<string | number>,
  rows: Array<Array<string | number>>,
): string {
  return `${title}\n\n${renderMarkdownTable(headers, rows)}\n`;
}

export function buildSourceFieldRows<T>({
  counts,
  extraCells,
  fields,
  formatValue,
  sourceNames,
  sourceOrder,
}: SourceFieldRowsOptions<T>): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [];

  for (const source of sourceOrder) {
    if (!counts[source]) continue;

    rows.push([
      `**${sourceNames[source] || source}**`,
      ...(extraCells ? extraCells(source) : []),
      ...fields.map((field) => formatValue(counts[source]?.[field], source, field)),
    ]);
  }

  return rows;
}
