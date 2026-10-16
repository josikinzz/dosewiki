import { PROSE_ATTRIBUTES, INLINE_TAGS } from "./markup.mjs";

export const RECONCILE_DEFECT = "markup_mismatch";

function asNodes(content) {
  if (content === undefined) return [];
  return Array.isArray(content) ? content : [content];
}

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

export function reconcileBody({ sourceRaw, targetRaw, parse }) {
  let sourceSignature;
  let targetSignature;

  try {
    sourceSignature = treeSignature(parse(sourceRaw));
  } catch (error) {
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
