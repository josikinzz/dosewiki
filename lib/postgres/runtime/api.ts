import type { Api } from "./api.generated";

export type FunctionKind = "query" | "mutation" | "action";
export type FunctionVisibility = "public" | "internal";
export type DefaultFunctionArgs = Record<string, any>;
export type FunctionReference<Kind extends FunctionKind = FunctionKind, Visibility extends FunctionVisibility = "public", Args extends DefaultFunctionArgs = any, Result = any, ComponentPath = string | undefined> = {
  readonly _type: Kind;
  readonly _visibility: Visibility;
  readonly _args: Args;
  readonly _returnType: Result;
  readonly _componentPath: ComponentPath;
};
export type FunctionArgs<F extends FunctionReference<any, any>> = F["_args"];
export type FunctionReturnType<F extends FunctionReference<any, any>> = F["_returnType"];
export type OptionalRestArgs<F extends FunctionReference<any, any>> = {} extends FunctionArgs<F> ? [args?: FunctionArgs<F>] : [args: FunctionArgs<F>];
export type ArgsAndOptions<F extends FunctionReference<any, any>, Options> = {} extends FunctionArgs<F> ? [args?: FunctionArgs<F>, options?: Options] : [args: FunctionArgs<F>, options?: Options];
export type HttpMutationOptions = { skipQueue?: boolean };

const FUNCTION_NAME = Symbol.for("functionName");
export function makeFunctionReference<Kind extends FunctionKind, Args extends DefaultFunctionArgs = any, Result = any>(name: string): FunctionReference<Kind, "public", Args, Result> {
  if (!/^[A-Za-z0-9_/-]+:[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) throw new Error(`Invalid Postgres function name: ${name}`);
  return Object.freeze({ [FUNCTION_NAME]: name }) as unknown as FunctionReference<Kind, "public", Args, Result>;
}
export function getFunctionName(reference: FunctionReference<any, any> | string): string {
  if (typeof reference === "string") return reference;
  const name = (reference as unknown as Record<symbol, unknown>)?.[FUNCTION_NAME];
  if (typeof name !== "string") throw new Error("Expected a named Postgres function reference");
  return name;
}

type VisibleApi<Visibility extends FunctionVisibility> = { [Module in keyof Api]: { [Name in keyof Api[Module] as Api[Module][Name] extends FunctionReference<any, Visibility> ? Name : never]: Api[Module][Name] } };
function references(): Api {
  const modules = new Map<string, object>();
  return new Proxy(Object.create(null), {
    get(_target, module: string | symbol) {
      if (typeof module !== "string" || module === "then") return undefined;
      if (!modules.has(module)) {
        const functions = new Map<string, FunctionReference>();
        modules.set(module, new Proxy(Object.create(null), {
          get(_exports, name: string | symbol) {
            if (typeof name !== "string" || name === "then") return undefined;
            if (!functions.has(name)) functions.set(name, makeFunctionReference(`${module}:${name}`));
            return functions.get(name);
          },
        }));
      }
      return modules.get(module);
    },
  });
}

/** Browser-safe references contain names only; server modules are type-only imports. */
export const api = references() as VisibleApi<"public">;
export const internal = references() as VisibleApi<"internal">;
