export type BuildSurface = "public" | "editor";

export function resolveBuildSurface(env?: NodeJS.ProcessEnv): BuildSurface;

export function resolveBuildDirectory(env?: NodeJS.ProcessEnv): string;
