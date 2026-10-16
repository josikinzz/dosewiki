import copyBlockDefaultsSource from "@content/copy-blocks/copyBlocks.json";

const COPY_BLOCK_KINDS = ["markdown", "plain", "list"] as const

export type CopyBlockKind = (typeof COPY_BLOCK_KINDS)[number];

export type CopyBlockDefinition = {
  key: string;
  flavor?: string;
  kind: CopyBlockKind;
  body?: string;
  items?: string[];
  label: string;
  group: string;
};

function isCopyBlockKind(value: unknown): value is CopyBlockKind {
  return typeof value === "string" && (COPY_BLOCK_KINDS as readonly string[]).includes(value);
}

function parseCopyBlockDefinition(raw: unknown): CopyBlockDefinition | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  if (
    typeof record.key !== "string" ||
    typeof record.label !== "string" ||
    typeof record.group !== "string" ||
    !isCopyBlockKind(record.kind)
  ) {
    return null;
  }

  const definition: CopyBlockDefinition = {
    key: record.key,
    kind: record.kind,
    label: record.label,
    group: record.group,
  };

  if (typeof record.flavor === "string" && record.flavor.length > 0) {
    definition.flavor = record.flavor;
  }

  if (record.kind === "list") {
    definition.items = Array.isArray(record.items)
      ? record.items.filter((item): item is string => typeof item === "string")
      : [];
  } else {
    definition.body = typeof record.body === "string" ? record.body : "";
  }

  return definition;
}

export const COPY_BLOCK_DEFAULTS: readonly CopyBlockDefinition[] = Array.isArray(
  copyBlockDefaultsSource,
)
  ? (copyBlockDefaultsSource as unknown[]).flatMap((entry) => {
      const parsed = parseCopyBlockDefinition(entry);
      return parsed ? [parsed] : [];
    })
  : [];

const DEFAULTS_BY_KEY = new Map<string, CopyBlockDefinition>(
  COPY_BLOCK_DEFAULTS.map((definition) => [definition.key, definition]),
);

export function getCopyBlockDefault(key: string): CopyBlockDefinition | null {
  return DEFAULTS_BY_KEY.get(key) ?? null;
}
