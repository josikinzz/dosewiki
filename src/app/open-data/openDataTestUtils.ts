import { gunzipSync } from "node:zlib";

/**
 * Test-only reader for the gzipped open-data downloads: `Response.json()`
 * cannot be used because the routes emit `Content-Encoding: gzip` bodies
 * (see openDataResponse in shared.ts) and transparent decompression only
 * happens on a real HTTP fetch.
 */
export async function readOpenDataPayload(response: Response): Promise<{
  dataset: string;
  generatedAt: string;
  count: number;
  license: string;
  licenseUrl: string;
  source: string;
  items: Array<Record<string, unknown>>;
}> {
  const body = Buffer.from(await response.arrayBuffer());
  return JSON.parse(gunzipSync(body).toString("utf8"));
}
