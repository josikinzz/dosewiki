import { createHash } from "node:crypto";

export const paragraphHash = (value) => createHash("sha256")
  .update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

export function astCharacters(node) {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(astCharacters).join("");
  return (node?.children ?? []).map(astCharacters).join("");
}

const insertedMarkup = new Set(["[p]", "[/p]", "[/p]\n\n[p]"]);

/** Offsets refer to the original JavaScript string, not UTF-8 bytes. */
export function applyRawParagraphInsertions(before, insertions) {
  let cursor = 0;
  let after = "";
  const receipt = [];
  for (const insertion of insertions) {
    const { offset, text } = insertion;
    if (!Number.isInteger(offset) || offset < cursor || offset > before.length ||
      !insertedMarkup.has(text) || receipt.at(-1)?.originalOffset === offset) {
      throw new Error("Invalid, unordered, or duplicate paragraph insertion");
    }
    if (insertion.beforeAnchor !== undefined &&
      before.slice(Math.max(0, offset - insertion.beforeAnchor.length), offset) !== insertion.beforeAnchor) {
      throw new Error("Stale paragraph prefix anchor");
    }
    if (insertion.afterAnchor !== undefined &&
      !before.slice(offset).startsWith(insertion.afterAnchor)) {
      throw new Error("Stale paragraph suffix anchor");
    }
    after += before.slice(cursor, offset);
    receipt.push({ offset: after.length, text, originalOffset: offset });
    after += text;
    cursor = offset;
  }
  after += before.slice(cursor);
  return { after, receipt };
}

/** Removes only recorded insertions, never pre-existing paragraph markup. */
export function restoreRawParagraphInsertions(after, receipt) {
  let restored = after;
  for (const { offset, text } of receipt.toReversed()) {
    if (restored.slice(offset, offset + text.length) !== text) throw new Error("Changed inserted markup");
    restored = restored.slice(0, offset) + restored.slice(offset + text.length);
  }
  return restored;
}

const inlineNodes = new Set(["int-link", "ext-link", "b", "i", "em", "strong", "sup", "sub", "span", "cite"]);

function splitChildren(children, breaks) {
  const total = astCharacters(children).length;
  if (breaks.some((offset, i) => !Number.isInteger(offset) || offset <= (breaks[i - 1] ?? 0) || offset >= total)) {
    throw new Error("Paragraph boundaries must be unique, ordered, and internal");
  }
  const segments = [[]];
  const origins = [];
  let position = 0;
  let boundary = 0;
  const append = (value, origin) => {
    origin.push([segments.length - 1, segments.at(-1).length]);
    segments.at(-1).push(value);
  };
  for (const child of children) {
    if (typeof child !== "string" && !inlineNodes.has(child?.name)) {
      throw new Error(`Refusing to paragraph-wrap non-inline node: ${child?.name}`);
    }
    if (breaks[boundary] === position) {
      segments.push([]);
      boundary += 1;
    }
    const length = astCharacters(child).length;
    const origin = { string: typeof child === "string", pieces: [] };
    let start = 0;
    while (breaks[boundary] < position + length) {
      if (!origin.string) throw new Error("Paragraph boundary would split an existing inline node");
      const end = breaks[boundary] - position;
      if (/[\uD800-\uDBFF]/.test(child[end - 1] ?? "") && /[\uDC00-\uDFFF]/.test(child[end] ?? "")) {
        throw new Error("Paragraph boundary would split a Unicode character");
      }
      append(child.slice(start, end), origin.pieces);
      segments.push([]);
      boundary += 1;
      start = end;
    }
    append(origin.string ? child.slice(start) : child, origin.pieces);
    origins.push(origin);
    position += length;
  }
  if (segments.some((segment) => !astCharacters(segment).trim())) throw new Error("Empty paragraph");
  return { segments, origins };
}

function atPath(root, path) {
  let target = root;
  for (const key of path) {
    if (target === null || target === undefined || !Object.hasOwn(target, key)) throw new Error("Stale AST path");
    target = target[key];
  }
  return target;
}

function targetPath(operation) {
  return operation.kind === "wrap" ? [...operation.path, operation.start] : operation.path;
}

function comparePaths(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) return typeof a[i] === "number" && typeof b[i] === "number" ? b[i] - a[i] : String(b[i]).localeCompare(String(a[i]));
  }
  return b.length - a.length;
}

/** No parsing from raw: repaired links and all existing AST metadata survive. */
export function applyAstParagraphPlan(before, operations) {
  if (!Array.isArray(before)) {
    if (operations.length) throw new Error("Cannot edit an absent AST");
    return { after: before, receipt: [] };
  }
  const after = structuredClone(before);
  const receipt = [];
  const sorted = operations.toSorted((a, b) => comparePaths(targetPath(a), targetPath(b)));
  for (const operation of sorted) {
    const { kind, path, breaks, expectedHash } = operation;
    if (kind !== "split" && kind !== "wrap") throw new Error("Unknown paragraph operation");
    const parent = atPath(after, kind === "split" ? path.slice(0, -1) : path);
    const start = kind === "split" ? path.at(-1) : operation.start;
    const count = kind === "split" ? 1 : operation.count;
    if (!Array.isArray(parent) || !Number.isInteger(start) || start < 0 || !Number.isInteger(count) || count < 1 || start + count > parent.length) {
      throw new Error("Invalid AST paragraph range");
    }
    const original = kind === "split" ? parent[start] : parent.slice(start, start + count);
    if (!expectedHash || paragraphHash(original) !== expectedHash) throw new Error("Stale AST paragraph target");
    if (kind === "split" && (original?.name !== "p" || !breaks.length)) throw new Error("Expected a paragraph to split");
    const children = kind === "split" ? original.children : original;
    const { segments, origins } = splitChildren(children, breaks);
    const paragraphs = segments.map((segment, index) => kind === "split" && index === 0
      ? { ...original, children: segment }
      : { name: "p", properties: {}, children: segment });
    parent.splice(start, count, ...paragraphs);
    receipt.push({ kind, path, start, paragraphCount: paragraphs.length, origins });
  }
  return { after, receipt };
}

/** Reassembles original string-node boundaries from provenance, not saved prose. */
export function restoreAstParagraphPlan(after, receipt) {
  if (!Array.isArray(after)) return after;
  const restored = structuredClone(after);
  for (const entry of receipt.toReversed()) {
    const parent = atPath(restored, entry.kind === "split" ? entry.path.slice(0, -1) : entry.path);
    const paragraphs = parent.slice(entry.start, entry.start + entry.paragraphCount);
    const covered = new Set(entry.origins.flatMap(({ pieces }) => pieces.map(([paragraph, child]) => `${paragraph}:${child}`)));
    if (paragraphs.length !== entry.paragraphCount || paragraphs.some((paragraph, index) =>
      paragraph.children?.some((_, child) => !covered.has(`${index}:${child}`)))) {
      throw new Error("Unrecorded paragraph content");
    }
    for (const [index, paragraph] of paragraphs.entries()) {
      if (paragraph?.name !== "p" || !Array.isArray(paragraph.children)) throw new Error("Changed paragraph wrapper");
      if ((entry.kind === "wrap" || index > 0) &&
        (Object.keys(paragraph).sort().join(",") !== "children,name,properties" || JSON.stringify(paragraph.properties) !== "{}")) {
        throw new Error("Changed inserted paragraph metadata");
      }
    }
    const children = entry.origins.map(({ string, pieces }) => {
      const values = pieces.map(([paragraph, child]) => paragraphs[paragraph].children[child]);
      if (string) {
        if (values.some((value) => typeof value !== "string")) throw new Error("Changed original string fragment");
        return values.join("");
      }
      if (values.length !== 1 || typeof values[0] !== "object") throw new Error("Changed original inline node");
      return values[0];
    });
    const originals = entry.kind === "split" ? [{ ...paragraphs[0], children }] : children;
    parent.splice(entry.start, entry.paragraphCount, ...originals);
  }
  return restored;
}
