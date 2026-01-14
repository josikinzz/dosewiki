import { decompressFromBase64 } from "../utils/lzString";
import { articlesCompressedBase64 } from "./articles.compressed";
import { z } from "zod";
import { substanceArticleSchema, type SubstanceArticle } from "../schema";

const decoded = decompressFromBase64(articlesCompressedBase64);

if (decoded === null) {
  throw new Error("Failed to decompress articles dataset");
}

const parsed = JSON.parse(decoded);
const result = z.array(substanceArticleSchema).safeParse(parsed);

if (!result.success) {
  const isTestEnv = import.meta.env?.MODE === "test" || import.meta.env?.VITEST;
  if (!isTestEnv) {
    console.warn("Article validation warnings:", result.error.issues);
  }
}

const articles: SubstanceArticle[] = result.success ? result.data : parsed;

export default articles;
