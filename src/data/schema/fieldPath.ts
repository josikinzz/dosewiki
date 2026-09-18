import type { SubstanceArticle } from "../../schema";

export type FieldPathOperation = "registry" | "override" | "section" | "read" | "write";

export type FieldPathSegment =
  | { kind: "property"; key: string }
  | { kind: "array"; key: string; index: number | "template" };

export interface ParsedFieldPath {
  original: string;
  normalized: string;
  segments: FieldPathSegment[];
  isTemplate: boolean;
  isIndexed: boolean;
}

export interface FieldPathDiagnostic {
  path: string;
  operation: FieldPathOperation;
  code:
    | "empty_path"
    | "invalid_segment"
    | "template_not_allowed"
    | "indexed_not_allowed"
    | "unknown_registry_path"
    | "unknown_section_path";
  message: string;
  severity: "error" | "warning";
}

export interface FieldPathValidationOptions {
  operation: FieldPathOperation;
  knownRegistryPaths?: ReadonlySet<string> | readonly string[];
  allowUnknownOverridePaths?: boolean;
}

/**
 * A schema-declared key: a plain JavaScript identifier, written verbatim.
 */
const PLAIN_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * A key as it appears inside a path.
 *
 * Schema keys are identifiers, but several editable leaves sit under record
 * keys the *data* chooses: `legality.countries["United States"].notes`,
 * `subjective_effects.progressive_stages["1. Taking Off"].note`. Those keys
 * carry spaces, punctuation, and even dots, none of which survive a naive
 * `split(".")`. So a non-identifier key travels percent-encoded — the same
 * escape `encodeURIComponent` uses, extended to cover `.`, `*`, and the other
 * characters it leaves bare — which keeps every segment inside a charset that
 * cannot be confused with the path syntax around it.
 */
const ENCODED_KEY_PATTERN = /^[A-Za-z0-9_%-]+$/;
const ARRAY_SEGMENT_PATTERN = /^([A-Za-z0-9_%-]+)\[(\d*)\]$/;

/**
 * Characters `encodeURIComponent` leaves unescaped that a field path still
 * cannot carry literally (`.` splits segments, `*` marks a wildcard template,
 * and the rest are reserved so an encoded key stays inside the pattern above).
 */
const EXTRA_ESCAPED_CHARACTERS = /[.*!'()~]/g;

/** Encodes one record key for use as a field-path segment. */
export function encodeFieldPathKey(key: string): string {
  if (PLAIN_KEY_PATTERN.test(key)) return key;
  return encodeURIComponent(key).replace(
    EXTRA_ESCAPED_CHARACTERS,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
}

/** Decodes one field-path segment back to the record key it addresses. */
export function decodeFieldPathKey(segment: string): string | undefined {
  if (!segment.includes("%")) return segment;
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

/**
 * Builds a concrete field path from already-decoded parts.
 *
 * `buildFieldPath("legality", "countries", "United States", "notes")` →
 * `legality.countries.United%20States.notes`. Numbers become array indices.
 */
export function buildFieldPath(...parts: Array<string | number>): string {
  return parts
    .map((part) =>
      typeof part === "number" ? `[${part}]` : `.${encodeFieldPathKey(part)}`,
    )
    .join("")
    .replace(/^\./, "");
}

function toPathSet(paths?: ReadonlySet<string> | readonly string[]): ReadonlySet<string> | undefined {
  if (!paths) return undefined;
  return paths instanceof Set ? paths : new Set(paths);
}

function diagnostic(
  path: string,
  operation: FieldPathOperation,
  code: FieldPathDiagnostic["code"],
  message: string,
  severity: FieldPathDiagnostic["severity"] = "error"
): FieldPathDiagnostic {
  return { path, operation, code, message, severity };
}

export function parseFieldPath(path: string): ParsedFieldPath | FieldPathDiagnostic {
  if (typeof path !== "string" || path.trim() === "") {
    return diagnostic(path, "read", "empty_path", "Field path must be a non-empty string.");
  }

  const rawSegments = path.split(".");
  const segments: FieldPathSegment[] = [];
  let isTemplate = false;
  let isIndexed = false;

  for (const rawSegment of rawSegments) {
    if (rawSegment === "") {
      return diagnostic(path, "read", "invalid_segment", `Field path contains an empty segment.`);
    }

    const arrayMatch = rawSegment.match(ARRAY_SEGMENT_PATTERN);
    if (arrayMatch) {
      const [, rawKey, indexText] = arrayMatch;
      const key = decodeFieldPathKey(rawKey);
      if (key === undefined || key === "") {
        return diagnostic(path, "read", "invalid_segment", `Invalid field path segment "${rawSegment}".`);
      }
      const index = indexText === "" ? "template" : Number(indexText);
      if (index === "template") {
        isTemplate = true;
      } else {
        isIndexed = true;
      }
      segments.push({ kind: "array", key, index });
      continue;
    }

    if (!ENCODED_KEY_PATTERN.test(rawSegment)) {
      return diagnostic(path, "read", "invalid_segment", `Invalid field path segment "${rawSegment}".`);
    }

    const key = decodeFieldPathKey(rawSegment);
    if (key === undefined || key === "") {
      return diagnostic(path, "read", "invalid_segment", `Invalid field path segment "${rawSegment}".`);
    }

    segments.push({ kind: "property", key });
  }

  return {
    original: path,
    normalized: formatFieldPath(segments),
    segments,
    isTemplate,
    isIndexed,
  };
}

export function isFieldPathDiagnostic(
  result: unknown
): result is FieldPathDiagnostic {
  return typeof result === "object" && result !== null && "code" in result;
}

export function formatFieldPath(segments: readonly FieldPathSegment[]): string {
  return segments
    .map((segment) => {
      const key = encodeFieldPathKey(segment.key);
      if (segment.kind === "property") return key;
      return `${key}[${segment.index === "template" ? "" : segment.index}]`;
    })
    .join(".");
}

export function normalizeFieldPath(path: string): string | undefined {
  const parsed = parseFieldPath(path);
  return isFieldPathDiagnostic(parsed) ? undefined : parsed.normalized;
}

export function isTemplateFieldPath(path: string): boolean {
  const parsed = parseFieldPath(path);
  return !isFieldPathDiagnostic(parsed) && parsed.isTemplate;
}

export function isIndexedFieldPath(path: string): boolean {
  const parsed = parseFieldPath(path);
  return !isFieldPathDiagnostic(parsed) && parsed.isIndexed;
}

export function templatePathToIndexedPath(path: string, index: number): string | FieldPathDiagnostic {
  if (!Number.isInteger(index) || index < 0) {
    return diagnostic(path, "write", "invalid_segment", `Route index must be a non-negative integer.`);
  }

  const parsed = parseFieldPath(path);
  if (isFieldPathDiagnostic(parsed)) return parsed;
  if (!parsed.isTemplate) {
    return diagnostic(path, "write", "template_not_allowed", "Expected a template field path.");
  }

  return formatFieldPath(
    parsed.segments.map((segment) =>
      segment.kind === "array" && segment.index === "template" ? { ...segment, index } : segment
    )
  );
}

export function routeTemplatePathToConcretePath(path: string, index: number): string | FieldPathDiagnostic {
  return templatePathToIndexedPath(path, index);
}

export function routeTemplatePathToRouteRelativePath(path: string): string | FieldPathDiagnostic {
  const parsed = parseFieldPath(path);
  if (isFieldPathDiagnostic(parsed)) return parsed;

  const templateIndex = parsed.segments.findIndex(
    (segment) => segment.kind === "array" && segment.index === "template"
  );
  if (templateIndex === -1) {
    return diagnostic(path, "read", "template_not_allowed", "Expected a route template field path.");
  }

  return formatFieldPath(parsed.segments.slice(templateIndex + 1));
}

export function validateFieldPath(
  path: string,
  options: FieldPathValidationOptions
): FieldPathDiagnostic[] {
  const parsed = parseFieldPath(path);
  if (isFieldPathDiagnostic(parsed)) {
    return [{ ...parsed, operation: options.operation }];
  }

  const diagnostics: FieldPathDiagnostic[] = [];
  const registryPaths = toPathSet(options.knownRegistryPaths);

  if ((options.operation === "read" || options.operation === "write") && parsed.isTemplate) {
    diagnostics.push(
      diagnostic(path, options.operation, "template_not_allowed", "Template field paths cannot target article data.")
    );
  }

  if ((options.operation === "registry" || options.operation === "override" || options.operation === "section") && parsed.isIndexed) {
    diagnostics.push(
      diagnostic(path, options.operation, "indexed_not_allowed", "Registry, override, and section paths must use template notation.")
    );
  }

  if (options.operation === "registry" && registryPaths && !registryPaths.has(parsed.normalized)) {
    diagnostics.push(
      diagnostic(path, options.operation, "unknown_registry_path", "Path is not present in the generated field registry.")
    );
  }

  if (options.operation === "override" && registryPaths && !registryPaths.has(parsed.normalized)) {
    diagnostics.push(
      diagnostic(
        path,
        options.operation,
        "unknown_registry_path",
        "Override path is not present in the generated field registry.",
        options.allowUnknownOverridePaths ? "warning" : "error"
      )
    );
  }

  if (options.operation === "section" && registryPaths && !registryPaths.has(parsed.normalized)) {
    diagnostics.push(
      diagnostic(path, options.operation, "unknown_section_path", "Section path is not present in the field registry.", "warning")
    );
  }

  return diagnostics;
}

/**
 * Keys a data-chosen path segment may never resolve to.
 *
 * Record keys now come from article data, and both walkers below index a plain
 * object with them, so `__proto__` in a path is a prototype-pollution primitive
 * rather than a missing field. Rejected in the walkers themselves, not only at
 * the allow-list, so no future caller inherits the hole.
 */
const FORBIDDEN_PATH_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function hasForbiddenKey(segments: readonly FieldPathSegment[]): boolean {
  return segments.some((segment) => FORBIDDEN_PATH_KEYS.has(segment.key));
}

export function getArticleValueByPath(obj: unknown, path: string): unknown {
  const parsed = parseFieldPath(path);
  if (isFieldPathDiagnostic(parsed) || parsed.isTemplate) return undefined;
  if (hasForbiddenKey(parsed.segments)) return undefined;

  let current: unknown = obj;

  for (const segment of parsed.segments) {
    if (current == null) return undefined;

    if (segment.kind === "array") {
      const arr = (current as Record<string, unknown>)[segment.key];
      if (!Array.isArray(arr) || segment.index === "template" || segment.index >= arr.length) {
        return undefined;
      }
      current = arr[segment.index];
    } else {
      current = (current as Record<string, unknown>)[segment.key];
    }
  }

  return current;
}

export function setArticleValueByPath<T>(obj: T, path: string, value: unknown): T {
  const parsed = parseFieldPath(path);
  if (isFieldPathDiagnostic(parsed) || parsed.isTemplate || parsed.segments.length === 0) {
    return obj;
  }
  if (hasForbiddenKey(parsed.segments)) return obj;

  const result = structuredClone(obj) as Record<string, unknown>;
  let current: Record<string, unknown> = result;

  for (let i = 0; i < parsed.segments.length - 1; i++) {
    const segment = parsed.segments[i];
    const nextSegment = parsed.segments[i + 1];

    if (segment.kind === "array") {
      if (!Array.isArray(current[segment.key])) {
        current[segment.key] = [];
      }
      if (segment.index === "template") return obj;
      const arr = current[segment.key] as unknown[];
      while (arr.length <= segment.index) {
        arr.push({});
      }
      if (typeof arr[segment.index] !== "object" || arr[segment.index] === null) {
        arr[segment.index] = {};
      }
      current = arr[segment.index] as Record<string, unknown>;
      continue;
    }

    if (current[segment.key] == null || typeof current[segment.key] !== "object") {
      current[segment.key] = nextSegment.kind === "array" ? [] : {};
    }
    current = current[segment.key] as Record<string, unknown>;
  }

  const lastSegment = parsed.segments[parsed.segments.length - 1];
  if (lastSegment.kind === "array") {
    if (lastSegment.index === "template") return obj;
    if (!Array.isArray(current[lastSegment.key])) {
      current[lastSegment.key] = [];
    }
    (current[lastSegment.key] as unknown[])[lastSegment.index] = value;
  } else {
    current[lastSegment.key] = value;
  }

  return result as T;
}

export function getSubstanceArticleValue(article: SubstanceArticle, path: string): unknown {
  return getArticleValueByPath(article, path);
}

export function setSubstanceArticleValue(
  article: SubstanceArticle,
  path: string,
  value: unknown
): SubstanceArticle {
  return setArticleValueByPath(article, path, value);
}
