/**
 * The build surface and build directory, resolved once from the environment.
 *
 * Shared by next.config.ts (which needs the values to configure the artifact),
 * the prerender policy (which decides what a surface prerenders), and the
 * deploy scripts (which find the finished build). Keeping the rule in one
 * module means the census script reads the directory the build actually wrote.
 */

export const BUILD_SURFACES = Object.freeze(["public", "editor"]);

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
