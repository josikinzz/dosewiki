import "server-only";

import { createHash } from "node:crypto";
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
  type Parts = { shell: Shell; items: Item[]; version: string };
  const inFlight = new Map<string, Promise<Parts | null>>();
  const readOnce = (...args: Args): Promise<Parts | null> => {
    const key = JSON.stringify(args);
    let pending = inFlight.get(key);
    if (!pending) {
      pending = read(...args).then((value) => value === null ? null : splitPublicCacheValue(value, split));
      inFlight.set(key, pending);
    }
    return pending;
  };
  const cacheOptions = { revalidate: options.revalidate, awaitRefresh: true };

  const readManifest = publicDataCache(async (...args: Args): Promise<Manifest<Shell> | null> => {
    const value = await readOnce(...args);
    return value ? chunkPublicCacheValue(value, options.chunkSize).manifest : null;
  }, [...keyParts, "manifest"], { ...cacheOptions, tags: options.tags });

  const readChunk = publicDataCache(async (version: string, index: number, ...args: Args): Promise<Chunk<Item>> => {
    const value = await readOnce(...args);
    const chunk = value?.version === version ? chunkPublicCacheValue(value, options.chunkSize).chunks[index] : undefined;
    if (!chunk) throw new Error(`${keyParts.join("/")}: chunk ${index} changed since manifest ${version}`);
    return chunk;
  }, [...keyParts, "chunk"], { ...cacheOptions, tags: (_version, _index, ...args) => options.tags(...args) });

  return async (...args: Args) => {
    const key = JSON.stringify(args);
    const owner = !inFlight.has(key);
    try {
      const manifest = await readManifest(...args);
      if (!manifest) return null;
      const chunks = await Promise.all(Array.from({ length: manifest.chunks }, (_, index) => readChunk(manifest.version, index, ...args).catch(() => null)));
      if (chunks.every((chunk) => chunk?.version === manifest.version)) {
        return join(manifest.shell, chunks.flatMap((chunk) => chunk!.items));
      }
      const fresh = await readOnce(...args);
      return fresh ? join(fresh.shell, fresh.items) : null;
    } finally {
      if (owner) inFlight.delete(key);
    }
  };
}
