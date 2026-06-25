import { Buffer } from "node:buffer";
import { substanceArticlesPayloadSchema } from "../../substanceArticlePayloadValidation.mjs";

export const getPayloadByteLength = (rawBody) => {
  if (rawBody == null) {
    return 0;
  }
  if (typeof rawBody === "string") {
    return Buffer.byteLength(rawBody, "utf8");
  }
  if (Buffer.isBuffer(rawBody)) {
    return rawBody.byteLength;
  }
  try {
    return Buffer.byteLength(JSON.stringify(rawBody), "utf8");
  } catch {
    return 0;
  }
};

export const validateArticlesPayload = (articlesData) => {
  return substanceArticlesPayloadSchema.safeParse(articlesData);
};
