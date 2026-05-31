import type { VCodeContent, VCodeNode } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isVCodeNode(value: unknown): value is VCodeNode {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.name === "string" &&
    isRecord(value.properties) &&
    Array.isArray(value.children) &&
    value.children.every((child) => typeof child === "string" || isVCodeNode(child))
  );
}

export function normalizeVCodeContent(ast: unknown, raw: string | undefined): VCodeContent | undefined {
  if (typeof ast === "string" && ast.trim().length > 0) {
    return ast;
  }

  if (isVCodeNode(ast)) {
    return ast;
  }

  if (Array.isArray(ast) && ast.every((node) => typeof node === "string" || isVCodeNode(node))) {
    return ast;
  }

  return raw && raw.trim().length > 0 ? raw : undefined;
}
