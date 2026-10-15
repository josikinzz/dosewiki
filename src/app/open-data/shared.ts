import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { NextResponse } from "next/server";
import {
  buildOpenDataDocument,
  OPEN_DATA_CACHE_CONTROL,
  type OpenDataDataset,
} from "@server/open-data/datasets";

export async function openDataResponse(dataset: OpenDataDataset): Promise<NextResponse> {
  const { count, json } = await buildOpenDataDocument(dataset);
  const body = gzipSync(json);

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Encoding": "gzip",
      Vary: "Accept-Encoding",
      "Content-Disposition": `attachment; filename="${dataset.name}.json"`,
      "Cache-Control": OPEN_DATA_CACHE_CONTROL,
      "X-Open-Data-Count": String(count),
      "X-Open-Data-Bytes": String(Buffer.byteLength(json)),
      "X-Open-Data-Revision": createHash("sha256").update(json).digest("hex"),
    },
  });
}
