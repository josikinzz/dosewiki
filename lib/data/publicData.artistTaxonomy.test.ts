import { describe, expect, it, vi } from "vitest";
import { createDataPublicDataReadAdapter } from "./publicData.reads";
import type { QueryTransport } from "./publicData.pagination";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

describe("public replication artist taxonomy reads", () => {
  it("keeps empty input and successful absence distinct from a failed read", async () => {
    const query = vi.fn<QueryTransport>().mockResolvedValue([]);
    const adapter = createDataPublicDataReadAdapter(query as QueryTransport);
    expect(await adapter.getPublicReplicationArtistsByKeys([])).toEqual([]);
    expect(query).not.toHaveBeenCalled();
    expect(await adapter.getPublicReplicationArtistsByKeys(["synthetic-artist"])).toEqual([]);
    expect(query).toHaveBeenCalledOnce();
  });

  it.each(["Server Error", "Could not find public function replicationTaxonomy:getPublicArtistsByKeys"])("propagates %s", async (message) => {
    const failure = new Error(message);
    const adapter = createDataPublicDataReadAdapter(async () => { throw failure; });
    await expect(adapter.getPublicReplicationArtistsByKeys(["synthetic-artist"])).rejects.toBe(failure);
  });
});
