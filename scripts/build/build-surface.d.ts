export type BuildSurface = "public" | "editor";

export const BUILD_SURFACES: readonly BuildSurface[];

export function resolveBuildSurface(env?: NodeJS.ProcessEnv): BuildSurface;

export function resolveBuildDirectory(env?: NodeJS.ProcessEnv): string;
