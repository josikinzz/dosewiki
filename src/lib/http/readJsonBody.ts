import { Buffer } from "node:buffer";

export class JsonBodyError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "JsonBodyError";
    this.status = status;
  }
}

type ReadJsonBodyOptions = {
  maxBytes: number;
};

export async function readJsonBody<T = unknown>(
  request: Request,
  options: ReadJsonBodyOptions,
): Promise<T> {
  const rawBody = await request.text();

  if (Buffer.byteLength(rawBody, "utf8") > options.maxBytes) {
    throw new JsonBodyError(413, "Payload too large.");
  }

  if (rawBody.trim().length === 0) {
    return {} as T;
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    throw new JsonBodyError(400, "Invalid JSON body.");
  }
}
