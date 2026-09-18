export interface ChemicalClassNodeInput {
  key: string;
  label: string;
  parents?: string[];
}

export interface ChemicalClassTree {
  roots: string[];
  childrenOf(key: string): string[];
  parentsOf(key: string): string[];
  lineageOf(key: string): string[];
  siblingsOf(key: string): string[];
  descendantsOf(key: string): string[];
}

export function buildChemicalClassTree(nodes: ChemicalClassNodeInput[]): ChemicalClassTree {
  const nodeByKey = new Map<string, ChemicalClassNodeInput>();
  const order = new Map<string, number>();

  nodes.forEach((node, index) => {
    if (nodeByKey.has(node.key)) {
      throw new Error(`Duplicate chemical class key "${node.key}".`);
    }
    nodeByKey.set(node.key, node);
    order.set(node.key, index);
  });

  const parentsByKey = new Map<string, string[]>();
  const childrenByKey = new Map<string, string[]>();
  const roots: string[] = [];

  for (const node of nodes) {
    const parents = node.parents ?? [];
    parentsByKey.set(node.key, [...parents]);
    if (parents.length === 0) {
      roots.push(node.key);
    }

    for (const parent of parents) {
      if (!nodeByKey.has(parent)) {
        throw new Error(`Chemical class "${node.key}" declares unknown parent "${parent}".`);
      }
      const children = childrenByKey.get(parent) ?? [];
      children.push(node.key);
      childrenByKey.set(parent, children);
    }
  }

  const visitState = new Map<string, "visiting" | "visited">();
  const visit = (key: string, path: string[]) => {
    const state = visitState.get(key);
    if (state === "visiting") {
      const cycleStart = path.indexOf(key);
      const cycle = [...path.slice(Math.max(cycleStart, 0)), key].join(" -> ");
      throw new Error(`Chemical class parent cycle detected: ${cycle}.`);
    }
    if (state === "visited") return;

    visitState.set(key, "visiting");
    for (const child of childrenByKey.get(key) ?? []) {
      visit(child, [...path, child]);
    }
    visitState.set(key, "visited");
  };

  for (const key of nodeByKey.keys()) {
    visit(key, [key]);
  }

  const requireKey = (key: string) => {
    if (!nodeByKey.has(key)) {
      throw new Error(`Unknown chemical class key "${key}".`);
    }
  };

  const sortedByManualOrder = (keys: Iterable<string>) =>
    Array.from(keys).sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

  return {
    roots: [...roots],
    childrenOf(key) {
      requireKey(key);
      return [...(childrenByKey.get(key) ?? [])];
    },
    parentsOf(key) {
      requireKey(key);
      return [...(parentsByKey.get(key) ?? [])];
    },
    lineageOf(key) {
      requireKey(key);
      const lineage: string[] = [];
      const seen = new Set<string>();
      let current: string | undefined = key;

      while (current) {
        if (seen.has(current)) {
          throw new Error(`Chemical class parent cycle detected while resolving lineage for "${key}".`);
        }
        seen.add(current);
        lineage.push(current);
        current = parentsByKey.get(current)?.[0];
      }

      return lineage.reverse();
    },
    siblingsOf(key) {
      requireKey(key);
      const primaryParent = parentsByKey.get(key)?.[0];
      const siblings = primaryParent ? childrenByKey.get(primaryParent) ?? [] : roots;
      return siblings.filter((sibling) => sibling !== key);
    },
    descendantsOf(key) {
      requireKey(key);
      const descendants = new Set<string>();
      const walk = (parent: string) => {
        for (const child of childrenByKey.get(parent) ?? []) {
          if (descendants.has(child)) continue;
          descendants.add(child);
          walk(child);
        }
      };
      walk(key);
      return sortedByManualOrder(descendants);
    },
  };
}
