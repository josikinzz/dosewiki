import { decompressFromBase64 } from "../utils/lzString";
import { articlesCompressedBase64 } from "./articles.compressed";

const decoded = decompressFromBase64(articlesCompressedBase64);

if (decoded === null) {
  throw new Error("Failed to decompress articles dataset");
}

const articles = JSON.parse(decoded) as unknown[];

export default articles;
