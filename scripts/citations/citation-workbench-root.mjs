// The citation workbench is a private directory outside the repository. Its
// location is never guessed from the current user's home: callers pass an
// explicit path or set DOSEWIKI_CITATION_WORKBENCH. Resolution is lazy so pure
// library modules and their tests can import callers without the variable set.
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
