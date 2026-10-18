export type BuildSurface = "public" | "editor";

export type SiteFlavorName = "dosewiki" | "effectindex";

export type ReleaseArtifact = "public" | "editor" | "effectindex";

type BuildEnv = Readonly<Record<string, string | undefined>>;

export const SITE_FLAVORS: readonly ["dosewiki", "effectindex"];

export const DEFAULT_SITE_FLAVOR: "dosewiki";

export const RELEASE_ARTIFACTS: readonly ReleaseArtifact[];

export interface ArtifactIdentity {
  readonly artifact: ReleaseArtifact;
  readonly surface: BuildSurface;
  readonly flavor: SiteFlavorName;
  readonly buildEnv: Readonly<{ DOSEWIKI_BUILD_SURFACE: BuildSurface; NEXT_PUBLIC_SITE_FLAVOR: SiteFlavorName }>;
  readonly buildDirectory: string;
  readonly ownsWriterCrons: boolean;
}

export function normalizeSiteFlavor(raw: string | undefined): SiteFlavorName;

export function resolveBuildSurface(env?: BuildEnv): BuildSurface;

export function resolveBuildDirectory(env?: BuildEnv): string;

export function resolveArtifact(name: string | undefined): ArtifactIdentity;

export function keepPublicBuildInputs(envFileText: string): string;

export function prebuiltDeploymentIdForRun(env?: BuildEnv): string | undefined;

export function resolvePrebuiltDeploymentId(env?: BuildEnv): string | undefined;

export function unignoreBuildDirectories(vercelignoreText: string): string;

export function artifactOutputs(name: string | undefined, env?: BuildEnv): string;
