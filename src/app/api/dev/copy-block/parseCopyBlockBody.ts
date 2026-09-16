/**
 * Request-body validation for one copy block, shared by the direct save
 * (`POST /api/dev/copy-block`) and the proposal route, so an editor's proposal
 * is held to exactly what the admin's save is held to.
 */
import { JsonBodyError } from "@/lib/http/readJsonBody";

const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const COPY_BLOCK_KINDS = ["markdown", "plain", "list"] as const;

/** Matches the Postgres-side ceilings in `server/copyBlocks.ts`. */
const BODY_MAX_LENGTH = 20_000;
const ITEM_MAX_LENGTH = 2_000;
const MAX_ITEMS = 64;
const LABEL_MAX_LENGTH = 120;

type CopyBlockKind = (typeof COPY_BLOCK_KINDS)[number];

export type CopyBlockBody = {
  key?: unknown;
  flavor?: unknown;
  kind?: unknown;
  body?: unknown;
  items?: unknown;
  label?: unknown;
  group?: unknown;
};

export type ParsedCopyBlock = {
  key: string;
  flavor?: string;
  kind: CopyBlockKind;
  body?: string;
  items?: string[];
  label: string;
  group: string;
};

export function requireCopyBlockKey(raw: unknown): string {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!KEY_PATTERN.test(key)) {
    throw new JsonBodyError(400, "A valid lower-case copy block key is required.");
  }
  return key;
}

function requireShortText(raw: unknown, label: string): string {
  if (typeof raw !== "string") {
    throw new JsonBodyError(400, `${label} must be a string.`);
  }
  const value = raw.trim();
  if (!value) {
    throw new JsonBodyError(400, `${label} is required.`);
  }
  if (value.length > LABEL_MAX_LENGTH) {
    throw new JsonBodyError(400, `${label} must be ${LABEL_MAX_LENGTH} characters or fewer.`);
  }
  return value;
}

export function parseCopyBlockBody(raw: CopyBlockBody): ParsedCopyBlock {
  const key = requireCopyBlockKey(raw.key);

  const kind = raw.kind;
  if (typeof kind !== "string" || !(COPY_BLOCK_KINDS as readonly string[]).includes(kind)) {
    throw new JsonBodyError(400, "A copy block must be markdown, plain, or list.");
  }

  const parsed: ParsedCopyBlock = {
    key,
    kind: kind as CopyBlockKind,
    label: requireShortText(raw.label, "The label"),
    group: requireShortText(raw.group, "The group"),
  };

  if (typeof raw.flavor === "string" && raw.flavor.trim()) {
    parsed.flavor = raw.flavor.trim();
  }

  if (parsed.kind === "list") {
    if (!Array.isArray(raw.items)) {
      throw new JsonBodyError(400, "A list copy block needs an array of items.");
    }
    if (raw.items.length > MAX_ITEMS) {
      throw new JsonBodyError(400, `A list copy block may hold at most ${MAX_ITEMS} items.`);
    }
    parsed.items = raw.items.map((item) => {
      if (typeof item !== "string") {
        throw new JsonBodyError(400, "Each list item must be a string.");
      }
      if (item.length > ITEM_MAX_LENGTH) {
        throw new JsonBodyError(
          400,
          `Each list item must be ${ITEM_MAX_LENGTH} characters or fewer.`,
        );
      }
      return item;
    });
    return parsed;
  }

  if (typeof raw.body !== "string") {
    throw new JsonBodyError(400, "A markdown or plain copy block needs body text.");
  }
  if (raw.body.length > BODY_MAX_LENGTH) {
    throw new JsonBodyError(400, `A copy block must be ${BODY_MAX_LENGTH} characters or fewer.`);
  }
  parsed.body = raw.body;

  return parsed;
}

/**
 * The `copyBlocks` entries of a proposal payload. Each is parsed exactly as the
 * direct save parses one block; anything that is not an array is no blocks.
 */
export function parseCopyBlockPayloads(raw: unknown): ParsedCopyBlock[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new JsonBodyError(400, "copyBlocks must be an array.");
  }
  return raw.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new JsonBodyError(400, "Each copy block must be an object.");
    }
    return parseCopyBlockBody(entry as CopyBlockBody);
  });
}
