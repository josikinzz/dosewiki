type ImportMetaEnvShape = {
  DEV?: boolean;
  MODE?: string;
  PROD?: boolean;
  VITE_CONVEX_URL?: string;
  VITE_SHOW_CONVEX_DEBUG?: string;
};

const importMetaEnv = (import.meta as ImportMeta & { env?: ImportMetaEnvShape }).env;

export const publicConvexUrl =
  importMetaEnv?.VITE_CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL ?? undefined;

export const isProductionRuntime =
  importMetaEnv?.PROD === true ||
  importMetaEnv?.MODE === "production" ||
  process.env.NODE_ENV === "production";

export const isDevelopmentRuntime =
  importMetaEnv?.DEV === true ||
  importMetaEnv?.MODE === "development" ||
  process.env.NODE_ENV !== "production";

export const showConvexDebug =
  importMetaEnv?.VITE_SHOW_CONVEX_DEBUG === "true" ||
  process.env.NEXT_PUBLIC_SHOW_CONVEX_DEBUG === "true";
