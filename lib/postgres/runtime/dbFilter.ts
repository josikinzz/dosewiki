import { encodeDocumentValue } from "../documentCodec";
import type { Doc } from "./dbRows";

// ---------------------------------------------------------------------------
// Filter expressions (`q.eq(q.field("x"), 1)` etc.) evaluated in process.
// ---------------------------------------------------------------------------

export type Expr =
  | { kind: "field"; path: string }
  | { kind: "literal"; value: unknown }
  | { kind: "op"; op: string; args: Expr[] };

export const lit = (value: unknown): Expr =>
  value !== null && typeof value === "object" && "kind" in (value as object) && (value as Expr).kind
    ? (value as Expr)
    : { kind: "literal", value };

export const filterBuilder = {
  field: (path: string): Expr => ({ kind: "field", path }),
  eq: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "eq", args: [lit(a), lit(b)] }),
  neq: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "neq", args: [lit(a), lit(b)] }),
  lt: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "lt", args: [lit(a), lit(b)] }),
  lte: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "lte", args: [lit(a), lit(b)] }),
  gt: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "gt", args: [lit(a), lit(b)] }),
  gte: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "gte", args: [lit(a), lit(b)] }),
  add: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "add", args: [lit(a), lit(b)] }),
  sub: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "sub", args: [lit(a), lit(b)] }),
  mul: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "mul", args: [lit(a), lit(b)] }),
  div: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "div", args: [lit(a), lit(b)] }),
  mod: (a: unknown, b: unknown): Expr => ({ kind: "op", op: "mod", args: [lit(a), lit(b)] }),
  neg: (a: unknown): Expr => ({ kind: "op", op: "neg", args: [lit(a)] }),
  and: (...args: unknown[]): Expr => ({ kind: "op", op: "and", args: args.map(lit) }),
  or: (...args: unknown[]): Expr => ({ kind: "op", op: "or", args: args.map(lit) }),
  not: (a: unknown): Expr => ({ kind: "op", op: "not", args: [lit(a)] }),
};

/** Document value order: undefined < null < bigint < number < boolean < string < bytes < array < object. */
function typeRank(value: unknown): number {
  if (value === undefined) return 0;
  if (value === null) return 1;
  if (typeof value === "bigint") return 2;
  if (typeof value === "number") return 3;
  if (typeof value === "boolean") return 4;
  if (typeof value === "string") return 5;
  if (value instanceof ArrayBuffer) return 6;
  if (Array.isArray(value)) return 7;
  return 8;
}

function compareValues(a: unknown, b: unknown): number {
  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) return ra - rb;
  switch (ra) {
    case 2:
    case 3:
    case 4:
      return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0;
    case 5:
      return (a as string) < (b as string) ? -1 : (a as string) > (b as string) ? 1 : 0;
    case 7: {
      const x = a as unknown[];
      const y = b as unknown[];
      for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
        const c = compareValues(x[i], y[i]);
        if (c !== 0) return c;
      }
      return x.length - y.length;
    }
    default: {
      const x = JSON.stringify(encodeDocumentValue(a));
      const y = JSON.stringify(encodeDocumentValue(b));
      return x < y ? -1 : x > y ? 1 : 0;
    }
  }
}

export function readPath(doc: Doc, path: string): unknown {
  let current: unknown = doc;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function evaluate(expr: Expr, doc: Doc): unknown {
  switch (expr.kind) {
    case "field":
      return readPath(doc, expr.path);
    case "literal":
      return expr.value;
    case "op": {
      const [a, b] = expr.args;
      const ev = (e: Expr) => evaluate(e, doc);
      switch (expr.op) {
        case "eq":
          return compareValues(ev(a), ev(b)) === 0;
        case "neq":
          return compareValues(ev(a), ev(b)) !== 0;
        case "lt":
          return compareValues(ev(a), ev(b)) < 0;
        case "lte":
          return compareValues(ev(a), ev(b)) <= 0;
        case "gt":
          return compareValues(ev(a), ev(b)) > 0;
        case "gte":
          return compareValues(ev(a), ev(b)) >= 0;
        case "add":
          return (ev(a) as number) + (ev(b) as number);
        case "sub":
          return (ev(a) as number) - (ev(b) as number);
        case "mul":
          return (ev(a) as number) * (ev(b) as number);
        case "div":
          return (ev(a) as number) / (ev(b) as number);
        case "mod":
          return (ev(a) as number) % (ev(b) as number);
        case "neg":
          return -(ev(a) as number);
        case "and":
          return expr.args.every((e) => ev(e) === true);
        case "or":
          return expr.args.some((e) => ev(e) === true);
        case "not":
          return ev(a) !== true;
        default:
          throw new Error(`Unsupported filter op ${expr.op}`);
      }
    }
  }
}
