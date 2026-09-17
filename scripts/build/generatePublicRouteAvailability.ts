#!/usr/bin/env bun

import { rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { createDataClient } from "../lib/data-client.ts";

import { api } from "../../lib/postgres/runtime/api.ts";
import { getFlagValue } from "../lib/data-ops-run-context.mjs";
import { isPublishableReplication } from "../../src/types/replications";

const OUTPUT_PATH = path.join(
  process.cwd(),
  "src/data/publicRouteAvailability.generated.json",
);
const PAGE_LIMIT = 64;
const MAX_PAGES = 512;
const MAX_ROWS = 20_000;

type CorpusPage<Item> = {
  items: Item[];
  cursor: string;
  isDone: boolean;
};

async function writeAtomic(targetPath: string, content: string): Promise<void> {
  const temporaryPath = `${targetPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content);
  await rename(temporaryPath, targetPath);
}

async function drainPages<Item>(
  readPage: (cursor?: string) => Promise<CorpusPage<Item>>,
): Promise<Item[]> {
  const items: Item[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
    const page = await readPage(cursor);
    if (!Array.isArray(page.items) || typeof page.isDone !== "boolean") {
      throw new Error("Public route availability read returned an invalid page.");
    }
    items.push(...page.items);
    if (items.length > MAX_ROWS) {
      throw new Error(`Public route availability exceeded ${MAX_ROWS} rows.`);
    }
    if (page.isDone) return items;
    if (
      typeof page.cursor !== "string" ||
      page.cursor.length === 0 ||
      seenCursors.has(page.cursor)
    ) {
      throw new Error("Public route availability pagination did not advance.");
    }
    seenCursors.add(page.cursor);
    cursor = page.cursor;
  }

  throw new Error(`Public route availability exceeded ${MAX_PAGES} pages.`);
}

async function main(): Promise<void> {
  const { client, fingerprint: deploymentName } = createDataClient();
  const expected = getFlagValue(process.argv.slice(2), "--expected-deployment");
  if (!expected || expected !== deploymentName) {
    throw new Error(`Public route availability requires --expected-deployment=${deploymentName} for the selected Postgres source.`);
  }
  const [substances, replications] = await Promise.all([
    drainPages((cursor) =>
      client.query(api.substanceIndex.getPublicLookupPage, {
        ...(cursor ? { cursor } : {}),
        limit: PAGE_LIMIT,
      }),
    ),
    drainPages((cursor) =>
      client.query(api.replications.getPublicGalleryPage, {
        ...(cursor ? { cursor } : {}),
        limit: PAGE_LIMIT,
      }),
    ),
  ]);

  const manifest = {
    version: 1,
    substances: [
      ...new Set(
        substances
          .map((row) => (typeof row.slug === "string" ? row.slug : ""))
          .filter(Boolean),
      ),
    ].sort(),
    replications: [
      ...new Set(
        replications
          .filter(isPublishableReplication)
          .filter((row) => Boolean(row.url))
          .map((row) => row.slug),
      ),
    ].sort(),
  };

  await writeAtomic(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `[public-route-availability] ${manifest.substances.length} substances and ${manifest.replications.length} replications from ${deploymentName}.`,
  );
}

await main();
