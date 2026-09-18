/**
 * Structured-body reconciliation.
 *
 * A VCode body is stored twice: the raw markup a person edits, and a syntax
 * tree the renderer walks. The pipeline translates the raw form only, then
 * re-derives the tree with the renderer's own parser, so the two can never
 * disagree about what the document is. A translation whose tree does not match
 * the source tree in node count, node kinds, nesting, or any machine-owned
 * property is rejected with its own defect code and the body keeps its English.
 *
 * The parser is injected rather than imported so this module stays a pure
 * comparison: the tests drive it with a stub, and the runner passes the real
 * `parseRawVCodeContent`. No tree is ever serialised into a model prompt.
 */

import { PROSE_ATTRIBUTES, INLINE_TAGS } from "./markup.mjs";

export const RECONCILE_DEFECT = "markup_mismatch";

function asNodes(content) {
  if (content === undefined) return [];
  return Array.isArray(content) ? content : [content];
}

/**
 * A tree's machine identity: which elements exist, how they nest, and every
 * property a reader does not see.
 *
 * Two things are deliberately not in it. Text is not, because text is what the
 * translation changes, and because moving a link to the front of a Chinese
 * clause merges or splits the text nodes around it without changing what the
 * document is. Inline order is not, for the same reason: Chinese word order
 * moves emphasis and links inside a sentence, and a rule that forbade it would
 * reject fluent translations and force literal ones.
 *
 * Block order is in it, and so is every block's identity, because a paragraph
 * that changed places or a scale level that vanished is a different document.
 */
export function treeSignature(content) {
  const describe = (node) => {
    const prose = PROSE_ATTRIBUTES[node.name] ?? [];
    const properties = Object.entries(node.properties ?? {})
      .filter(([key]) => !prose.includes(key))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join(",");
    return `${node.name}(${properties})`;
  };

  const walk = (nodes, depth) => {
    const blocks = [];
    const inlines = [];

    for (const node of nodes) {
      if (typeof node === "string" || !node || typeof node !== "object") continue;
      const entry = [`${depth}:${describe(node)}`, ...walk(node.children ?? [], depth + 1)];
      (INLINE_TAGS.has(node.name) ? inlines : blocks).push(entry.join("|"));
    }

    return [...blocks, ...inlines.sort()];
  };

  return walk(asNodes(content), 0);
}

function firstDifference(source, target) {
  const limit = Math.max(source.length, target.length);
  for (let index = 0; index < limit; index += 1) {
    if (source[index] !== target[index]) {
      return { index, source: source[index] ?? "<end>", target: target[index] ?? "<end>" };
    }
  }
  return null;
}

/**
 * @param {object} input
 * @param {string} input.sourceRaw - the stored body
 * @param {string} input.targetRaw - the same body with translated spans spliced in
 * @param {(raw: string) => unknown} input.parse - the renderer's parser
 * @returns {{ok: boolean, defects: string[], details: object}}
 */
export function reconcileBody({ sourceRaw, targetRaw, parse }) {
  let sourceSignature;
  let targetSignature;

  try {
    sourceSignature = treeSignature(parse(sourceRaw));
  } catch (error) {
    // A source the parser cannot read is a data defect, not a translation one.
    return { ok: false, defects: [RECONCILE_DEFECT], details: { unparsableSource: String(error?.message ?? error) } };
  }

  try {
    targetSignature = treeSignature(parse(targetRaw));
  } catch (error) {
    return { ok: false, defects: [RECONCILE_DEFECT], details: { unparsableTarget: String(error?.message ?? error) } };
  }

  if (sourceSignature.length !== targetSignature.length) {
    return {
      ok: false,
      defects: [RECONCILE_DEFECT],
      details: {
        nodeCount: { source: sourceSignature.length, target: targetSignature.length },
        firstDifference: firstDifference(sourceSignature, targetSignature),
      },
    };
  }

  const difference = firstDifference(sourceSignature, targetSignature);
  if (difference) {
    return { ok: false, defects: [RECONCILE_DEFECT], details: { firstDifference: difference } };
  }

  return { ok: true, defects: [], details: {} };
}
