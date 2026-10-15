const BUILD_SURFACES = Object.freeze(["public", "editor"]);

export const SITE_FLAVORS = Object.freeze(["dosewiki", "effectindex"]);
export const DEFAULT_SITE_FLAVOR = "dosewiki";

const ARTIFACTS = Object.freeze({
  public: Object.freeze({ surface: "public", flavor: "dosewiki" }),
  editor: Object.freeze({ surface: "editor", flavor: "dosewiki" }),
  effectindex: Object.freeze({ surface: "public", flavor: "effectindex" }),
});

export const RELEASE_ARTIFACTS = Object.freeze(Object.keys(ARTIFACTS));

export function normalizeSiteFlavor(raw) {
  const normalized = raw?.trim().toLowerCase() ?? "";
  return SITE_FLAVORS.includes(normalized) ? normalized : DEFAULT_SITE_FLAVOR;
}

export function resolveBuildSurface(env = process.env) {
  const surface =
    env.DOSEWIKI_BUILD_SURFACE ?? (env.NODE_ENV === "development" ? "editor" : "public");
  if (!BUILD_SURFACES.includes(surface)) {
    throw new Error("DOSEWIKI_BUILD_SURFACE must be public or editor.");
  }
  return surface;
}

export function resolveBuildDirectory(env = process.env) {
  return env.DOSEWIKI_BUILD_DIR ?? (resolveBuildSurface(env) === "editor" ? ".next-editor" : ".next");
}

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
    ownsWriterCrons: entry.surface === "editor",
  });
}

const PUBLIC_BUILD_INPUT = /^(NEXT_PUBLIC_[A-Z0-9_]+|NODE_OPTIONS)=/;

export function keepPublicBuildInputs(envFileText) {
  return envFileText
    .split("\n")
    .filter((line) => PUBLIC_BUILD_INPUT.test(line))
    .join("\n");
}

export function prebuiltDeploymentIdForRun(env = process.env) {
  if (!env.GITHUB_RUN_ID || !env.GITHUB_RUN_ATTEMPT) return undefined;
  return `gh-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
}

export function resolvePrebuiltDeploymentId(env = process.env) {
  return env.DOSEWIKI_PREBUILT_DEPLOYMENT_ID?.trim() || undefined;
}

const BUILD_DIRECTORY_IGNORE_RULE = ".next-*/";

export function unignoreBuildDirectories(vercelignoreText) {
  const lines = vercelignoreText.split("\n");
  if (!lines.includes(BUILD_DIRECTORY_IGNORE_RULE)) {
    throw new Error(`.vercelignore no longer carries the ${BUILD_DIRECTORY_IGNORE_RULE} rule this step removes.`);
  }
  return lines.filter((line) => line !== BUILD_DIRECTORY_IGNORE_RULE).join("\n");
}

export function artifactOutputs(name, env = process.env) {
  const { surface, flavor, buildDirectory } = resolveArtifact(name);
  const deploymentId = prebuiltDeploymentIdForRun(env);
  const lines = [`surface=${surface}`, `flavor=${flavor}`, `dir=${buildDirectory}`];
  if (deploymentId) lines.push(`deployment_id=${deploymentId}`);
  return `${lines.join("\n")}\n`;
}
