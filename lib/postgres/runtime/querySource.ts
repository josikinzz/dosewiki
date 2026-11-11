import { AsyncLocalStorage } from "node:async_hooks";

export type QuerySource = "public" | "editor" | "effectindex" | "cron" | "script";

const scopedSource = new AsyncLocalStorage<QuerySource>();

export function deploymentQuerySource(): QuerySource {
  if (!process.env.NEXT_RUNTIME) return "script";
  if (process.env.NEXT_PUBLIC_EDITOR_BUILD === "true") return "editor";
  return process.env.NEXT_PUBLIC_SITE_FLAVOR?.trim().toLowerCase() === "effectindex" ? "effectindex" : "public";
}

export function runWithQuerySource<T>(source: QuerySource, operation: () => T): T {
  return scopedSource.run(source, operation);
}

export function postgresApplicationName(): string {
  return `dosewiki-${deploymentQuerySource()}`;
}

export function queryTag(functionName: string): string {
  const tags: Array<[string, string]> = [
    ["application", "dosewiki"],
    ["function", functionName],
    ["source", scopedSource.getStore() ?? deploymentQuerySource()],
  ];
  return `/*${tags.map(([key, value]) => `${key}='${encodeURIComponent(value).replace(/'/g, "%27")}'`).join(",")}*/`;
}
