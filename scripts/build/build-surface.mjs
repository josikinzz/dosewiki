/**
 * Artifact identity: the release artifact name in, every build fact out.
 *
 * A release artifact is one of `public`, `editor` or `effectindex`. From that
 * name this module derives the build surface, the site flavor, the build
 * directory, cron ownership, the build inputs a prebuilt upload may keep, the
 * skew-protection ID a prebuilt upload adopts, and the upload's ignore rule.
 * The artifacts stay separate (AGENTS.md rule 4); this module only names them.
 *
 * Shared by next.config.ts, src/config/siteFlavor.ts (flavor normalisation),
 * the prerender policy, the artifact audit, the deploy scripts, and the
 * workflows through scripts/build/build-surface-cli.mjs. It must stay free of
 * imports: it is bundled into browser code through siteFlavor.ts, and the
 * remote build workflow runs its CLI before dependencies are installed.
 */

const BUILD_SURFACES = Object.freeze(["public", "editor"]);

export const SITE_FLAVORS = Object.freeze(["dosewiki", "effectindex"]);
export const DEFAULT_SITE_FLAVOR = "dosewiki";

const ARTIFACTS = Object.freeze({
  public: Object.freeze({ surface: "public", flavor: "dosewiki" }),
  editor: Object.freeze({ surface: "editor", flavor: "dosewiki" }),
  effectindex: Object.freeze({ surface: "public", flavor: "effectindex" }),
});

/** Release artifacts in release order. */
export const RELEASE_ARTIFACTS = Object.freeze(Object.keys(ARTIFACTS));

/**
 * `NEXT_PUBLIC_SITE_FLAVOR` as the build sees it: trimmed and lower-cased;
 * unset, empty or unrecognised values fall back to dose.wiki.
 */
export function normalizeSiteFlavor(raw) {
  const normalized = raw?.trim().toLowerCase() ?? "";
  return SITE_FLAVORS.includes(normalized) ? normalized : DEFAULT_SITE_FLAVOR;
}

/**
 * `DOSEWIKI_BUILD_SURFACE`, defaulting to `editor` in development and `public`
 * everywhere else. Throws on any other value: a typo must not silently ship a
 * public artifact with editorial modules or an editor artifact without them.
 */
export function resolveBuildSurface(env = process.env) {
  const surface =
    env.DOSEWIKI_BUILD_SURFACE ?? (env.NODE_ENV === "development" ? "editor" : "public");
  if (!BUILD_SURFACES.includes(surface)) {
    throw new Error("DOSEWIKI_BUILD_SURFACE must be public or editor.");
  }
  return surface;
}

/**
 * `DOSEWIKI_BUILD_DIR` exists so a flavor or surface artifact can be built side
 * by side without clobbering the directory a running server is serving; unset
 * keeps the deployed paths byte-identical (`.next` public, `.next-editor` editor).
 */
export function resolveBuildDirectory(env = process.env) {
  return env.DOSEWIKI_BUILD_DIR ?? (resolveBuildSurface(env) === "editor" ? ".next-editor" : ".next");
}

/** Every fact a release artifact's build and upload need, from its name alone. */
export function resolveArtifact(name) {
  const entry = Object.hasOwn(ARTIFACTS, name ?? "") ? ARTIFACTS[name] : undefined;
  if (!entry) {
    throw new Error(`Unknown artifact ${name}; expected ${RELEASE_ARTIFACTS.join(", ")}.`);
  }
  const buildEnv = Object.freeze({
    DOSEWIKI_BUILD_SURFACE: entry.surface,
    NEXT_PUBLIC_SITE_FLAVOR: entry.flavor,
  });
  return Object.freeze({
    artifact: name,
    surface: entry.surface,
    flavor: entry.flavor,
    buildEnv,
    buildDirectory: resolveBuildDirectory(buildEnv),
    // Writer jobs under /api/cron/ belong to the editor project alone.
    ownsWriterCrons: entry.surface === "editor",
  });
}

/**
 * The lines of a pulled Vercel environment file a prebuilt build may keep: the
 * public inputs a Vercel-hosted build would inline too. Every other line,
 * including every secret, is dropped.
 */
const PUBLIC_BUILD_INPUT = /^(NEXT_PUBLIC_[A-Z0-9_]+|NODE_OPTIONS)=/;

export function keepPublicBuildInputs(envFileText) {
  return envFileText
    .split("\n")
    .filter((line) => PUBLIC_BUILD_INPUT.test(line))
    .join("\n");
}

/**
 * A prebuilt upload has no platform deployment ID at build time, so it names
 * one per workflow run for skew protection. Undefined outside a workflow run.
 */
export function prebuiltDeploymentIdForRun(env = process.env) {
  if (!env.GITHUB_RUN_ID || !env.GITHUB_RUN_ATTEMPT) return undefined;
  return `gh-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
}

/**
 * The ID next.config.ts adopts as `deploymentId` at build and request time.
 * Vercel's runtime ID would stamp preload links that disagree with the font
 * URLs compiled into the CSS.
 */
export function resolvePrebuiltDeploymentId(env = process.env) {
  return env.DOSEWIKI_PREBUILT_DEPLOYMENT_ID?.trim() || undefined;
}

/**
 * A prebuilt upload drops every function file `.vercelignore` excludes, except
 * under default output paths such as `.next`. The editor builds into
 * `.next-editor`, so the upload checkout drops the `.next-*` rule. Throws when
 * the rule is gone, so a renamed rule cannot silently skip the repair.
 */
const BUILD_DIRECTORY_IGNORE_RULE = ".next-*/";

export function unignoreBuildDirectories(vercelignoreText) {
  const lines = vercelignoreText.split("\n");
  if (!lines.includes(BUILD_DIRECTORY_IGNORE_RULE)) {
    throw new Error(`.vercelignore no longer carries the ${BUILD_DIRECTORY_IGNORE_RULE} rule this step removes.`);
  }
  return lines.filter((line) => line !== BUILD_DIRECTORY_IGNORE_RULE).join("\n");
}

/** `key=value` lines for a workflow step's `$GITHUB_OUTPUT`. */
export function artifactOutputs(name, env = process.env) {
  const { surface, flavor, buildDirectory } = resolveArtifact(name);
  const deploymentId = prebuiltDeploymentIdForRun(env);
  const lines = [`surface=${surface}`, `flavor=${flavor}`, `dir=${buildDirectory}`];
  if (deploymentId) lines.push(`deployment_id=${deploymentId}`);
  return `${lines.join("\n")}\n`;
}
