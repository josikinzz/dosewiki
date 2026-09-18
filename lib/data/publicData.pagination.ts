export type QueryArgs = Record<string, unknown>;
export type QueryTransport = <Result, Args extends QueryArgs = Record<string, never>>(
  name: string,
  args: Args,
) => Promise<Result>;

const PUBLIC_CORPUS_MAX_PAGES = 512;
const PUBLIC_CORPUS_MAX_ROWS = 20_000;

type PublicCorpusPage<Item> = {
  items: Item[];
  cursor: string;
  isDone: boolean;
};

type PublicCorpusPageSource = {
  functionName: string;
  args: (cursor?: string) => { cursor?: string; limit: number };
};

type PublicCorpusDrainLimits = {
  maxPages: number;
  maxRows: number;
};

type PublicCorpusVisitResult = "done" | "stopped";

export async function visitPublicCorpusPages<Item>(
  query: QueryTransport,
  source: PublicCorpusPageSource,
  limits: PublicCorpusDrainLimits,
  visitItems: (items: Item[]) => boolean,
): Promise<PublicCorpusVisitResult> {
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let rowCount = 0;

  for (let pageNumber = 1; pageNumber <= limits.maxPages; pageNumber += 1) {
    const page = await query<PublicCorpusPage<Item>, { cursor?: string; limit: number }>(
      source.functionName,
      source.args(cursor),
    );

    if (!Array.isArray(page.items) || typeof page.isDone !== "boolean") {
      throw new Error(`Public corpus page "${source.functionName}" returned an invalid payload.`);
    }
    rowCount += page.items.length;
    if (rowCount > limits.maxRows) {
      throw new Error(
        `Public corpus pagination for "${source.functionName}" exceeded maxRows (${limits.maxRows}).`,
      );
    }
    if (visitItems(page.items)) {
      return "stopped";
    }
    if (page.isDone) {
      return "done";
    }
    if (
      typeof page.cursor !== "string" ||
      page.cursor.length === 0 ||
      seenCursors.has(page.cursor)
    ) {
      throw new Error(`Public corpus pagination for "${source.functionName}" did not advance.`);
    }
    seenCursors.add(page.cursor);
    cursor = page.cursor;
  }

  throw new Error(
    `Public corpus pagination for "${source.functionName}" exceeded maxPages (${limits.maxPages}).`,
  );
}

export async function drainPublicCorpusPages<Item>(
  query: QueryTransport,
  source: PublicCorpusPageSource,
): Promise<Item[]> {
  const items: Item[] = [];
  await visitPublicCorpusPages<Item>(
    query,
    source,
    { maxPages: PUBLIC_CORPUS_MAX_PAGES, maxRows: PUBLIC_CORPUS_MAX_ROWS },
    (pageItems) => {
      items.push(...pageItems);
      return false;
    },
  );
  return items;
}

type DataPaginationPage<Item> = {
  page: Item[];
  isDone: boolean;
  continueCursor: string | null;
};

/**
 * Drain a standard Postgres `paginationOpts` query (page/isDone/continueCursor),
 * unlike the bespoke corpus pages above (items/cursor/isDone). Shares their
 * fail-closed guards against malformed pages, stalled cursors, and runaway
 * reads.
 */
export async function drainDataPaginationPages<Item>(
  query: QueryTransport,
  source: {
    functionName: string;
    args: (cursor: string | null) => { paginationOpts: { cursor: string | null; numItems: number } };
  },
): Promise<Item[]> {
  const items: Item[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  for (let pageNumber = 1; pageNumber <= PUBLIC_CORPUS_MAX_PAGES; pageNumber += 1) {
    const result = await query<DataPaginationPage<Item>, { paginationOpts: { cursor: string | null; numItems: number } }>(
      source.functionName,
      source.args(cursor),
    );
    if (!Array.isArray(result.page) || typeof result.isDone !== "boolean") {
      throw new Error(`Postgres pagination for "${source.functionName}" returned an invalid payload.`);
    }
    items.push(...result.page);
    if (items.length > PUBLIC_CORPUS_MAX_ROWS) {
      throw new Error(
        `Postgres pagination for "${source.functionName}" exceeded maxRows (${PUBLIC_CORPUS_MAX_ROWS}).`,
      );
    }
    if (result.isDone) {
      return items;
    }
    const nextCursor = result.continueCursor;
    if (
      typeof nextCursor !== "string" ||
      nextCursor.length === 0 ||
      nextCursor === cursor ||
      seenCursors.has(nextCursor)
    ) {
      throw new Error(`Postgres pagination for "${source.functionName}" did not advance.`);
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  throw new Error(
    `Postgres pagination for "${source.functionName}" exceeded maxPages (${PUBLIC_CORPUS_MAX_PAGES}).`,
  );
}

export async function queryPaginatedPublicProjectionRead<RawItem, PublicResult>(
  query: QueryTransport,
  source: PublicCorpusPageSource,
  project: (result: RawItem[]) => PublicResult,
): Promise<PublicResult> {
  return project(await drainPublicCorpusPages<RawItem>(query, source));
}
