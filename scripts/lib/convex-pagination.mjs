const DEFAULT_PAGE_SIZE = 32;
const DEFAULT_MAX_PAGES = 10_000;
const DEFAULT_MAX_ROWS = 100_000;

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function validatePageResult(result, pageNumber) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`Convex page ${pageNumber} returned a malformed result`);
  }
  if (!Array.isArray(result.page) || typeof result.isDone !== "boolean") {
    throw new Error(`Convex page ${pageNumber} must include page[] and isDone`);
  }
  if (result.continueCursor !== null && typeof result.continueCursor !== "string") {
    throw new Error(`Convex page ${pageNumber} returned a malformed continueCursor`);
  }
  return result;
}

/**
 * Drain one standard Convex pagination query in stable page/row order.
 * Fails closed on malformed pages, cursor stalls, or unexpectedly large reads.
 */
export async function drainConvexPageQuery({
  client,
  query,
  queryArgs = {},
  pageSize = DEFAULT_PAGE_SIZE,
  maxPages = DEFAULT_MAX_PAGES,
  maxRows = DEFAULT_MAX_ROWS,
} = {}) {
  if (!client || typeof client.query !== "function") {
    throw new Error("drainConvexPageQuery: client.query is required");
  }
  if (!query) {
    throw new Error("drainConvexPageQuery: query is required");
  }
  const normalizedPageSize = Math.min(assertPositiveInteger(pageSize, "pageSize"), DEFAULT_PAGE_SIZE);
  const normalizedMaxPages = assertPositiveInteger(maxPages, "maxPages");
  const normalizedMaxRows = assertPositiveInteger(maxRows, "maxRows");
  if (Object.prototype.hasOwnProperty.call(queryArgs, "paginationOpts")) {
    throw new Error("drainConvexPageQuery: queryArgs must not override paginationOpts");
  }

  const rows = [];
  const seenCursors = new Set();
  let cursor = null;

  for (let pageNumber = 1; pageNumber <= normalizedMaxPages; pageNumber += 1) {
    const result = validatePageResult(await client.query(query, {
      ...queryArgs,
      paginationOpts: { cursor, numItems: normalizedPageSize },
    }), pageNumber);
    rows.push(...result.page);
    if (rows.length > normalizedMaxRows) {
      throw new Error(`Convex pagination exceeded maxRows (${normalizedMaxRows})`);
    }
    if (result.isDone) {
      return rows;
    }
    const nextCursor = result.continueCursor;
    if (typeof nextCursor !== "string" || nextCursor.length === 0) {
      throw new Error(`Convex page ${pageNumber} is unfinished without a usable continueCursor`);
    }
    if (nextCursor === cursor || seenCursors.has(nextCursor)) {
      throw new Error(`Convex pagination cursor stalled at page ${pageNumber}`);
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  throw new Error(`Convex pagination exceeded maxPages (${normalizedMaxPages})`);
}

export function getAllSubstanceDocuments(client, query, options = {}) {
  return drainConvexPageQuery({ client, query, ...options });
}

export async function getUniqueSubstanceDocumentBySlug(client, query, slug, options = {}) {
  if (typeof slug !== "string" || slug.length === 0) {
    throw new Error("getUniqueSubstanceDocumentBySlug: slug is required");
  }
  const matches = (await getAllSubstanceDocuments(client, query, options))
    .filter((article) => article?.slug === slug);
  if (matches.length > 1) {
    throw new Error(`Expected one substance for slug "${slug}", found ${matches.length}`);
  }
  return matches[0] ?? null;
}

export function getAllReferenceMetadata(client, query, options = {}) {
  return drainConvexPageQuery({ client, query, ...options });
}
