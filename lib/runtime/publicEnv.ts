import { getEditorBrowserReadTarget } from "../convex/runtimeTargets";

type ImportMetaEnvShape = {
  DEV?: boolean;
  MODE?: string;
  PROD?: boolean;
  VITE_CONVEX_URL?: string;
  VITE_SHOW_CONVEX_DEBUG?: string;
};

const importMetaEnv = (import.meta as ImportMeta & { env?: ImportMetaEnvShape }).env;

export const publicConvexUrl =
  getEditorBrowserReadTarget({
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    VITE_CONVEX_URL: importMetaEnv?.VITE_CONVEX_URL,
  }).selectedUrl ?? undefined;

