import "server-only";

import { createHash } from "node:crypto";
import { cache } from "react";
import { publicDataCache } from "./publicData.cache";

type ChunkedCacheOptions<Args extends unknown[]> = {
  revalidate: number | false;
  tags: (...args: Args) => string[];
  chunkSize: number;
};

type Manifest<Shell> = { version: string; chunks: number; shell: Shell };
type Chunk<Item> = { version: string; items: Item[] };

const versionOf = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function chunkPublicCacheValue<Shell, Item>(
  parts: { shell: Shell; items: Item[]; version: string },
  chunkSize: number,
): { manifest: Manifest<Shell>; chunks: Chunk<Item>[] } {
  const count = Math.ceil(parts.items.length / chunkSize);
  return {
    manifest: { version: parts.version, chunks: count, shell: parts.shell },
    chunks: Array.from({ length: count }, (_, index) => ({
      version: parts.version,
      items: parts.items.slice(index * chunkSize, (index + 1) * chunkSize),
    })),
  };
}

export function splitPublicCacheValue<Value, Shell, Item>(
  value: Value,
  split: (value: Value) => { shell: Shell; items: Item[] },
) {
  return { ...split(value), version: versionOf(value) };
}

export function publicDataChunkedCache<Args extends unknown[], Value, Shell, Item>(
  read: (...args: Args) => Promise<Value | null>,
  keyParts: string[],
  split: (value: Value) => { shell: Shell; items: Item[] },
  join: (shell: Shell, items: Item[]) => Value,
  options: ChunkedCacheOptions<Args>,
): (...args: Args) => Promise<Value | null> {
  const readOnce = cache(async (...args: Args) => {
    const value = await read(...args);
    return value === null ? null : splitPublicCacheValue(value, split);
  });
  const cacheOptions = { revalidate: options.revalidate, awaitRefresh: true };

  const readManifest = publicDataCache(async (...args: Args): Promise<Manifest<Shell> | null> => {
    const value = await readOnce(...args);
    return value ? chunkPublicCacheValue(value, options.chunkSize).manifest : null;
  }, [...keyParts, "manifest"], { ...cacheOptions, tags: options.tags });

  const readChunk = publicDataCache(async (index: number, ...args: Args): Promise<Chunk<Item> | null> => {
    const value = await readOnce(...args);
    return value ? chunkPublicCacheValue(value, options.chunkSize).chunks[index] ?? null : null;
  }, [...keyParts, "chunk"], { ...cacheOptions, tags: (_index, ...args) => options.tags(...args) });

  return async (...args: Args) => {
    const manifest = await readManifest(...args);
    if (!manifest) return null;
    const chunks = await Promise.all(Array.from({ length: manifest.chunks }, (_, index) => readChunk(index, ...args)));
    if (chunks.every((chunk) => chunk?.version === manifest.version)) {
      return join(manifest.shell, chunks.flatMap((chunk) => chunk!.items));
    }
    const fresh = await readOnce(...args);
    return fresh ? join(fresh.shell, fresh.items) : null;
  };
}
