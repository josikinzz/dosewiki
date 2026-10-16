import { resolve } from "node:path";

export const CITATION_WORKBENCH_ENV = "DOSEWIKI_CITATION_WORKBENCH";

export function resolveCitationWorkbenchRoot(explicit = null) {
  const value = explicit ?? process.env[CITATION_WORKBENCH_ENV];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `${CITATION_WORKBENCH_ENV} is not set. Point it at the citation workbench directory or pass --workbench.`,
    );
  }
  return resolve(value);
}
